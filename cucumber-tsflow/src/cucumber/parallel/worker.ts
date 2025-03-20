import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
import { register } from 'node:module';
import { Envelope, IdGenerator } from '@cucumber/messages';
import supportCodeLibraryBuilder from '@cucumber/cucumber/lib/support_code_library_builder/index';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import tryRequire from '@cucumber/cucumber/lib/try_require';
import { RuntimeOptions } from '@cucumber/cucumber/lib/runtime/index';
import { Worker } from '../worker';
import { WorkerToCoordinatorEvent, RunCommand } from '@cucumber/cucumber/lib/runtime/parallel/types';
import logger from '../../utils/logger';
import { ISourcesCoordinates } from '@cucumber/cucumber/api';
import { resolvePaths } from '@cucumber/cucumber/lib/paths/paths';
import { BindingRegistry } from '../../bindings/binding-registry';
import { InitializeTsflowCommand, CoordinatorToWorkerCommand } from '../../types/parallel';
import MessageCollector from '../message-collector';

const { uuid } = IdGenerator;

type IExitFunction = (exitCode: number, error?: Error, message?: string) => void;
type IMessageSender = (command: WorkerToCoordinatorEvent) => void;

export class ChildProcessWorker {
	private readonly cwd: string;
	private readonly exit: IExitFunction;

	private readonly id: string;
	private readonly eventBroadcaster: EventEmitter;
	private readonly newId: IdGenerator.NewId;
	private readonly sendMessage: IMessageSender;
	private options!: RuntimeOptions;
	private supportCodeLibrary!: SupportCodeLibrary;
	private worker!: Worker;

	constructor({
		cwd,
		exit,
		id,
		sendMessage
	}: {
		cwd: string;
		exit: IExitFunction;
		id: string;
		sendMessage: IMessageSender;
	}) {
		this.id = id;
		this.newId = uuid();
		this.cwd = cwd;
		this.exit = exit;
		this.sendMessage = sendMessage;
		this.eventBroadcaster = new EventEmitter();
		global.messageCollector = new MessageCollector();
		this.eventBroadcaster.on('envelope', (envelope: Envelope) => {
			global.messageCollector.parseEnvelope(envelope);
			this.sendMessage({ type: 'ENVELOPE', envelope });
		});
	}

	async initialize({
		supportCodeCoordinates,
		supportCodeIds,
		options,
		collectorData
	}: InitializeTsflowCommand): Promise<void> {
		global.messageCollector.addMessageData(collectorData);

		const sources = { paths: [] } as ISourcesCoordinates;
		const resolvedPaths = await resolvePaths(logger, this.cwd, sources, supportCodeCoordinates);
		const { requirePaths, importPaths } = resolvedPaths;
		supportCodeLibraryBuilder.reset(this.cwd, this.newId, {
			requirePaths,
			requireModules: supportCodeCoordinates.requireModules,
			importPaths,
			loaders: supportCodeCoordinates.loaders
		});
		supportCodeCoordinates.requireModules.map(module => tryRequire(module));
		logger.debug(process.version);
		requirePaths.map(module => tryRequire(module));
		for (const specifier of supportCodeCoordinates.loaders) {
			register(specifier, pathToFileURL('./'));
		}
		for (const path of supportCodeCoordinates.importPaths) {
			await import(pathToFileURL(path).toString());
		}
		this.supportCodeLibrary = supportCodeLibraryBuilder.finalize(supportCodeIds);
		BindingRegistry.instance.updateSupportCodeLibrary(this.supportCodeLibrary);

		this.options = options;
		this.worker = new Worker(this.id, this.eventBroadcaster, this.newId, this.options, this.supportCodeLibrary);
		await this.worker.runBeforeAllHooks();
		this.sendMessage({ type: 'READY' });
	}

	async finalize(): Promise<void> {
		await this.worker.runAfterAllHooks();
		this.exit(0);
	}

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

	async runTestCase(command: RunCommand): Promise<void> {
		const success = await this.worker.runTestCase(command.assembledTestCase, command.failing);
		this.sendMessage({
			type: 'FINISHED',
			success
		});
	}
}
