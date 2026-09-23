import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
import { registerLoader } from '../../api/register-loaders';
import { setExperimentalDecorators } from '../../utils/decorator-mode';
import { Envelope, IdGenerator } from '@cucumber/messages';
import supportCodeLibraryBuilder from '@cucumber/cucumber/lib/support_code_library_builder/index';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import tryRequire from '@cucumber/cucumber/lib/try_require';
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
import {
	startTimer,
	recordPhase,
	recordFile,
	collectLoaderTimings,
	getTimingSnapshot
} from '../../utils/tsflow-timing';

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

		// Reset the support code library with the paths the coordinator already resolved; the globs are not
		// expanded again in this process.
		const { requirePaths, importPaths } = resolvedSupportPaths;
		supportCodeLibraryBuilder.reset(this.cwd, this.newId, {
			requirePaths,
			requireModules: supportCodeCoordinates.requireModules,
			importPaths,
			loaders: supportCodeCoordinates.loaders
		});

		// Define the boolean type before loading any support code
		supportCodeLibraryBuilder.defineParameterType({
			name: 'boolean',
			regexp: /true|false/,
			transformer: s => (s === 'true' ? true : false)
		});

		// Load any require modules for CommonJS or loaders and imports for ESM
		let phaseStart = startTimer();
		supportCodeCoordinates.requireModules.map(module => tryRequire(module));
		recordPhase('support:require-modules', phaseStart);

		phaseStart = startTimer();
		requirePaths.map(module => {
			const fileStart = startTimer();
			tryRequire(module);
			recordFile('require', module, fileStart);
		});
		recordPhase('support:require', phaseStart);

		phaseStart = startTimer();
		for (const specifier of supportCodeCoordinates.loaders) {
			await registerLoader(specifier);
		}
		recordPhase('support:register-loaders', phaseStart);

		phaseStart = startTimer();
		for (const path of importPaths) {
			const fileStart = startTimer();
			await import(pathToFileURL(path).toString());
			recordFile('import', path, fileStart);
		}
		recordPhase('support:import', phaseStart);

		// Finalize the support code library with IDs passed in and
		// update entries in the library with info from our binding registry.
		phaseStart = startTimer();
		this.supportCodeLibrary = supportCodeLibraryBuilder.finalize(supportCodeIds);
		recordPhase('support:finalize', phaseStart);
		phaseStart = startTimer();
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
