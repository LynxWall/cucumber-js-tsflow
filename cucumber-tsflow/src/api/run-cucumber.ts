import { Envelope, IdGenerator, ParseError } from '@cucumber/messages';
import { EventEmitter } from 'events';
import { EventDataCollector } from '@cucumber/cucumber/lib/formatter/helpers/index';
import { emitMetaMessage, emitSupportCodeMessages } from '@cucumber/cucumber/lib/api/emit_support_code_messages';
import { IRunOptions, IRunResult } from '@cucumber/cucumber/lib/api/types';
import { resolvePaths } from '@cucumber/cucumber/lib/paths/index';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import { makeRuntime } from '../runtime/make-runtime';
import { initializeFormatters } from '@cucumber/cucumber/lib/api/formatters';
import { getSupportCodeLibrary } from './support';
import { IRunEnvironment, makeEnvironment } from '@cucumber/cucumber/lib/environment/index';
import { getPicklesAndErrors } from '@cucumber/cucumber/lib/api/gherkin';
import MessageCollector from '../runtime/message-collector';
import { version } from '../version';
import { initializeForRunCucumber } from '@cucumber/cucumber/lib/api/plugins';
import { IFilterablePickle } from '@cucumber/cucumber/lib/filter/index';
import 'polyfill-symbol-metadata';
import { BindingRegistry } from '../bindings/binding-registry';
import { ITsFlowRunOptionsRuntime } from '../runtime/types';
import { Console } from 'console';
import ansis from 'ansis';
import { parallelPreload } from './parallel-loader';
import { createLogger } from '../utils/tsflow-logger';
import { startTimer, recordPhase, collectLoaderTimings, printTimingReport } from '../utils/tsflow-timing';

const runLogger = createLogger('run-cucumber');

export interface ITsFlowRunOptions extends IRunOptions {
	runtime: ITsFlowRunOptionsRuntime;
}

/**
 * Execute a Cucumber test run.
 *
 * Extended from cucumber.js so that we can use our own implementation
 * of makeRuntime
 *
 * @public
 * @param options - Configuration loaded from `loadConfiguration`.
 * @param environment - Project environment.
 * @param onMessage - Callback fired each time Cucumber emits a message.
 */
export async function runCucumber(
	options: ITsFlowRunOptions,
	environment: IRunEnvironment = {},
	onMessage?: (message: Envelope) => void
): Promise<IRunResult> {
	const mergedEnvironment = makeEnvironment(environment);
	const { cwd, stdout, stderr, env, logger } = mergedEnvironment;

	logger.debug(`Running cucumber-tsflow ${version}
Working directory: ${cwd}
Running from: ${__dirname}
`);
	const consoleLogger = new Console(environment.stdout as any, environment.stderr);
	if (options.runtime.experimentalDecorators) {
		consoleLogger.info(ansis.yellowBright('Using Experimental Decorators.'));
	}
	if (options.runtime.parallel > 0) {
		consoleLogger.info(
			ansis.cyanBright(`Running Cucumber-TsFlow in Parallel with ${options.runtime.parallel} worker(s).\n`)
		);
	} else {
		consoleLogger.info(ansis.cyanBright('Running Cucumber-TsFlow in Serial mode.\n'));
	}

	const newId = IdGenerator.uuid();

	const supportCoordinates =
		'originalCoordinates' in options.support
			? options.support.originalCoordinates
			: Object.assign(
					{
						requireModules: [],
						requirePaths: [],
						loaders: [],
						importPaths: []
					},
					options.support
				);

	const pluginManager = await initializeForRunCucumber(
		{
			...options,
			support: supportCoordinates
		},
		mergedEnvironment
	);

	const resolvedPaths = await resolvePaths(logger, cwd, options.sources, supportCoordinates);
	pluginManager.emit('paths:resolve', resolvedPaths);
	const { sourcePaths, requirePaths, importPaths } = resolvedPaths;

	/**
	 * The support code library contains all of the hook and step definitions.
	 * These are loaded into the library when calling getSupportCodeLibrary,
	 * which loads all of the step definitions using require or import.
	 */
	let supportCodeLibrary =
		'originalCoordinates' in options.support
			? (options.support as SupportCodeLibrary)
			: await (async () => {
					// Parallel preload phase: warm transpiler caches in worker threads
					if (options.runtime.parallelLoad) {
						runLogger.checkpoint('Running parallel preload phase');
						consoleLogger.info(ansis.cyanBright('Pre-warming transpiler caches in parallel...\n'));
						const preloadStart = startTimer();
						try {
							const result = await parallelPreload({
								requirePaths,
								importPaths,
								requireModules: supportCoordinates.requireModules,
								loaders: supportCoordinates.loaders,
								experimentalDecorators: options.runtime.experimentalDecorators,
								threadCount: options.runtime.parallelLoad
							});
							runLogger.checkpoint('Parallel preload completed', {
								descriptors: result.descriptors.length,
								files: result.loadedFiles.length,
								durationMs: result.durationMs
							});
							consoleLogger.info(
								ansis.cyanBright(
									`Parallel preload completed in ${result.durationMs}ms ` +
										`(${result.loadedFiles.length} files, ${result.descriptors.length} bindings)\n`
								)
							);
						} catch (err: any) {
							runLogger.error('Parallel preload failed, falling back to serial load', err);
						}
						recordPhase('preload', preloadStart);
					}

					return getSupportCodeLibrary({
						logger,
						cwd,
						newId,
						requirePaths,
						requireModules: supportCoordinates.requireModules,
						importPaths,
						loaders: supportCoordinates.loaders
					});
				})();

	// Set support to the updated step and hook definitions
	// in the supportCodeLibrary. We also need to initialize originalCoordinates
	// to support parallel execution.
	let phaseStart = startTimer();
	supportCodeLibrary = BindingRegistry.instance.updateSupportCodeLibrary(supportCodeLibrary);
	supportCodeLibrary = { ...supportCodeLibrary, ...{ originalCoordinates: supportCoordinates } };
	options.support = supportCodeLibrary;
	recordPhase('registry:update', phaseStart);

	// Gather ESM loader hook timings and print the TSFLOW_TIMING report (no-op when disabled)
	const finishTiming = async (): Promise<void> => {
		await collectLoaderTimings();
		printTimingReport(stderr);
	};

	const eventBroadcaster = new EventEmitter();
	if (onMessage) {
		eventBroadcaster.on('envelope', onMessage);
	}
	eventBroadcaster.on('envelope', value => pluginManager.emit('message', value));

	// create a global instance of the message collector and bind it
	// to the event broadcaster. This is used by cucumber and for tests
	// that are not running in parallel.
	global.messageCollector = new MessageCollector(eventBroadcaster);

	// cast the MessageCollector to an EventDataCollector
	const eventDataCollector = global.messageCollector as unknown as EventDataCollector;

	let formatterStreamError = false;
	phaseStart = startTimer();
	const cleanupFormatters = await initializeFormatters({
		env,
		cwd,
		stdout,
		stderr,
		logger,
		onStreamError: () => (formatterStreamError = true),
		eventBroadcaster,
		eventDataCollector: eventDataCollector,
		configuration: options.formats,
		supportCodeLibrary,
		pluginManager
	});
	await emitMetaMessage(eventBroadcaster, env);
	recordPhase('formatters:init', phaseStart);

	let filteredPickles: ReadonlyArray<IFilterablePickle> = [];
	let parseErrors: ParseError[] = [];
	phaseStart = startTimer();
	if (sourcePaths.length > 0) {
		const gherkinResult = await getPicklesAndErrors({
			newId,
			cwd,
			sourcePaths,
			coordinates: options.sources,
			onEnvelope: envelope => eventBroadcaster.emit('envelope', envelope)
		});
		filteredPickles = await pluginManager.transform('pickles:filter', gherkinResult.filterablePickles);
		filteredPickles = await pluginManager.transform('pickles:order', filteredPickles);
		parseErrors = gherkinResult.parseErrors;
	}
	recordPhase('gherkin', phaseStart);
	if (parseErrors.length) {
		parseErrors.forEach(parseError => {
			logger.error(`Parse error in "${parseError.source.uri}" ${parseError.message}`);
		});
		await cleanupFormatters();
		await pluginManager.cleanup();
		await finishTiming();
		return {
			success: false,
			support: supportCodeLibrary
		};
	}

	emitSupportCodeMessages({
		eventBroadcaster,
		supportCodeLibrary,
		newId
	});

	phaseStart = startTimer();
	const runtime = await makeRuntime({
		environment,
		logger,
		eventBroadcaster,
		sourcedPickles: filteredPickles,
		newId,
		supportCodeLibrary,
		options: options.runtime,
		coordinates: options.sources,
		resolvedSupportPaths: { requirePaths, importPaths }
	});
	const success = await runtime.run();
	recordPhase('runtime:run', phaseStart);
	await pluginManager.cleanup();
	await cleanupFormatters();
	await finishTiming();

	return {
		success: success && !formatterStreamError,
		support: supportCodeLibrary
	};
}
