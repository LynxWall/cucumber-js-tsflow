import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
import { register } from 'node:module';
import { Envelope, IdGenerator } from '@cucumber/messages';
import supportCodeLibraryBuilder from '@cucumber/cucumber/lib/support_code_library_builder/index';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import tryRequire from '@cucumber/cucumber/lib/try_require';
import { Worker } from '../worker';
import { WorkerToCoordinatorEvent, RunCommand } from '@cucumber/cucumber/lib/runtime/parallel/types';
import logger from '../../utils/logger';
import { resolvePaths } from '@cucumber/cucumber/lib/paths/paths';
import { BindingRegistry } from '../../bindings/binding-registry';
import { InitializeTsflowCommand, CoordinatorToWorkerCommand, TsFlowRuntimeOptions } from '../types';
import MessageCollector from '../message-collector';

const { uuid } = IdGenerator;

type IExitFunction = (exitCode: number, error?: Error, message?: string) => void;
type IMessageSender = (command: WorkerToCoordinatorEvent) => void;

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

		// initialize the global experimentalDecorators setting
		global.experimentalDecorators = experimentalDecorators;

		// pass any envelope messages up to the parent process to keep our main
		// message collector in sync with this one.
		this.eventBroadcaster.on('envelope', (envelope: Envelope) => this.sendMessage({ type: 'ENVELOPE', envelope }));
	}

	/**
	 * Initialize this child process worker
	 */
	async initialize({
		supportCodeCoordinates,
		supportCodeIds,
		options,
		messageData
	}: InitializeTsflowCommand): Promise<void> {
		// reset the message collector with message data passed in
		global.messageCollector.reset(messageData);

		// Get correct paths and reset the support code library
		const resolvedPaths = await resolvePaths(logger, this.cwd, messageData.coordinates, supportCodeCoordinates);
		const { requirePaths, importPaths } = resolvedPaths;
		supportCodeLibraryBuilder.reset(this.cwd, this.newId, {
			requirePaths,
			requireModules: supportCodeCoordinates.requireModules,
			importPaths,
			loaders: supportCodeCoordinates.loaders
		});
		// Load any require modules for CommonJS or loaders and imports for ESM
		supportCodeCoordinates.requireModules.map(module => tryRequire(module));
		requirePaths.map(module => tryRequire(module));
		for (const specifier of supportCodeCoordinates.loaders) {
			register(specifier, pathToFileURL('./'));
		}
		for (const path of importPaths) {
			await import(pathToFileURL(path).toString());
		}
		// Finalize the support code library with IDs passed in and
		// update entries in the library with info from our binding registry.
		this.supportCodeLibrary = supportCodeLibraryBuilder.finalize(supportCodeIds);
		this.supportCodeLibrary = BindingRegistry.instance.updateSupportCodeLibrary(this.supportCodeLibrary);

		// Initialize a worker and run BeforeAll hooks
		this.options = options;
		this.worker = new Worker(this.id, this.eventBroadcaster, this.newId, this.options, this.supportCodeLibrary);
		await this.worker.runBeforeAllHooks();
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
