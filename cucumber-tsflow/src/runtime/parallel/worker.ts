import { EventEmitter } from 'node:events';
import { getSupportCodeLibrary } from '../../api/support';
import { setExperimentalDecorators } from '../../utils/decorator-mode';
import { Envelope, IdGenerator } from '@cucumber/messages';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import { Worker } from '../worker';
import { RunCommand } from '@cucumber/cucumber/lib/runtime/parallel/types';
import { BindingRegistry } from '../../bindings/binding-registry';
import {
	InitializeTsflowCommand,
	CoordinatorToWorkerCommand,
	TsFlowRuntimeOptions,
	TsFlowWorkerToCoordinatorEvent
} from '../types';
import MessageCollector from '../message-collector';
import { startTimer, recordPhase, collectLoaderTimings, getTimingSnapshot } from '../../utils/tsflow-timing';

const { uuid } = IdGenerator;

type IExitFunction = (exitCode: number, error?: Error, message?: string) => void;
type IMessageSender = (command: TsFlowWorkerToCoordinatorEvent) => void;

/**
 * Represents a child process running in parallel executions
 */
export class ChildProcessWorker {
	private readonly cwd: string;
	private readonly exit: IExitFunction;

	private readonly id: string;
	private readonly eventBroadcaster: EventEmitter;
	private readonly newId: IdGenerator.NewId;
	private readonly sendMessage: IMessageSender;
	private options!: TsFlowRuntimeOptions;
	private supportCodeLibrary!: SupportCodeLibrary;
	private worker!: Worker;

	constructor({
		cwd,
		exit,
		id,
		sendMessage,
		experimentalDecorators
	}: {
		cwd: string;
		exit: IExitFunction;
		id: string;
		sendMessage: IMessageSender;
		experimentalDecorators: boolean;
	}) {
		this.id = id;
		this.newId = uuid();
		this.cwd = cwd;
		this.exit = exit;
		this.sendMessage = sendMessage;
		this.eventBroadcaster = new EventEmitter();

		// initialize a message collector for this process to handle our
		// integration with event data
		global.messageCollector = new MessageCollector(this.eventBroadcaster);

		// record the decorator mode the coordinator chose, for this process's decorators and transpilers
		setExperimentalDecorators(experimentalDecorators);

		// pass any envelope messages up to the parent process to keep our main
		// message collector in sync with this one.
		this.eventBroadcaster.on('envelope', (envelope: Envelope) => this.sendMessage({ type: 'ENVELOPE', envelope }));
	}

	/**
	 * Initialize this child process worker
	 */
	async initialize({
		testRunStartedId,
		supportCodeCoordinates,
		supportCodeIds,
		options,
		messageData,
		resolvedSupportPaths
	}: InitializeTsflowCommand): Promise<void> {
		// reset the message collector with message data passed in
		global.messageCollector.reset(messageData);

		// Load the support code with the paths the coordinator already resolved (the globs are not expanded
		// again in this process) and the ids its definitions must carry to match the coordinator's library
		const { requirePaths, importPaths } = resolvedSupportPaths;
		this.supportCodeLibrary = await getSupportCodeLibrary({
			cwd: this.cwd,
			newId: this.newId,
			requireModules: supportCodeCoordinates.requireModules,
			requirePaths,
			importPaths,
			loaders: supportCodeCoordinates.loaders,
			supportCodeIds
		});

		// Update entries in the library with info from our binding registry
		let phaseStart = startTimer();
		this.supportCodeLibrary = BindingRegistry.instance.updateSupportCodeLibrary(this.supportCodeLibrary);
		recordPhase('registry:update', phaseStart);

		// Initialize a worker and run the BeforeAll hooks; one that throws rejects this command, and run-worker.ts
		// reports the error and exits 1, which the coordinator counts as a failed run
		this.options = options;
		this.worker = new Worker(
			testRunStartedId,
			this.id,
			this.eventBroadcaster,
			this.newId,
			this.options,
			this.supportCodeLibrary
		);
		phaseStart = startTimer();
		await this.worker.runBeforeAllHooks();
		recordPhase('hooks:before-all', phaseStart);

		// Report this process's startup timings to the coordinator (no-op unless TSFLOW_TIMING=true)
		await collectLoaderTimings();
		const snapshot = getTimingSnapshot();
		if (snapshot) {
			this.sendMessage({ type: 'TIMING', workerId: this.id, snapshot });
		}
		this.sendMessage({ type: 'READY' });
	}

	/**
	 * Finialize the worker, which runs AfterAll hooks
	 */
	async finalize(): Promise<void> {
		await this.worker.runAfterAllHooks();
		this.exit(0);
	}

	/**
	 * Interaction with the main process and child workers is done through IPC communications
	 * This receives commands from the parent process and calls appropriate child operations.
	 * @param command commands sent to this worker
	 */
	async receiveMessage(command: CoordinatorToWorkerCommand): Promise<void> {
		switch (command.type) {
			case 'INITIALIZE':
				await this.initialize(command);
				break;
			case 'RUN':
				await this.runTestCase(command);
				break;
			case 'FINALIZE':
				await this.finalize();
				break;
		}
	}

	/**
	 * Run all test cases on the worker
	 * @param command RunCommand
	 */
	async runTestCase(command: RunCommand): Promise<void> {
		const success = await this.worker.runTestCase(command.assembledTestCase, command.failing);
		this.sendMessage({
			type: 'FINISHED',
			success
		});
	}
}
