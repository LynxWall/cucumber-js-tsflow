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
import { createLogger } from '../utils/tsflow-logger';
import { startTimer, recordPhase, collectLoaderTimings, printTimingReport } from '../utils/tsflow-timing';
import { StartupProgress, describeTranspiler, plural, resolveStartupTheme } from '../utils/startup-progress';
import { getTranspileCacheStats, pruneTranspileCache } from '../transpilers/transpile-cache';

const runLogger = createLogger('run-cucumber');

/** `, N of M transpiles from the cache` for the load-phase summary, or '' when nothing went through the cache. */
function describeTranspileCache(): string {
	const { hits, misses } = getTranspileCacheStats();
	const total = hits + misses;
	return total === 0 ? '' : `, ${hits} of ${plural(total, 'transpile')} from the cache`;
}

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

	// Themed, append-only feedback for the startup phases that used to run silently (TSFLOW_THEME)
	const progress = new StartupProgress(stdout, resolveStartupTheme());

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

	progress.begin('resolve', 'resolving support-code globs and plugins');
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
	const supportFileCount = requirePaths.length + importPaths.length;
	progress.end(`${plural(supportFileCount, 'support file')}, ${plural(sourcePaths.length, 'feature file')}`);

	/**
	 * The support code library contains all of the hook and step definitions.
	 * These are loaded into the library when calling getSupportCodeLibrary,
	 * which loads all of the step definitions using require or import.
	 */
	let supportCodeLibrary: SupportCodeLibrary;
	let phaseStart: number;
	try {
		supportCodeLibrary =
			'originalCoordinates' in options.support
				? (options.support as SupportCodeLibrary)
				: await (async () => {
						const transpiler = describeTranspiler(supportCoordinates.requireModules, supportCoordinates.loaders);
						progress.begin(
							'load',
							`transpiling and loading ${plural(supportFileCount, 'support file')}` +
								(transpiler ? ` with ${transpiler}` : ''),
							supportFileCount
						);
						return getSupportCodeLibrary({
							logger,
							cwd,
							newId,
							requirePaths,
							requireModules: supportCoordinates.requireModules,
							importPaths,
							loaders: supportCoordinates.loaders,
							onFileLoaded: () => progress.tick()
						});
					})();

		// Set support to the updated step and hook definitions
		// in the supportCodeLibrary. We also need to initialize originalCoordinates
		// to support parallel execution.
		phaseStart = startTimer();
		supportCodeLibrary = BindingRegistry.instance.updateSupportCodeLibrary(supportCodeLibrary);
		supportCodeLibrary = { ...supportCodeLibrary, ...{ originalCoordinates: supportCoordinates } };
		options.support = supportCodeLibrary;
		recordPhase('registry:update', phaseStart);
	} catch (err) {
		// Close the open progress line so the error that follows starts on its own line
		progress.end('failed');
		throw err;
	}
	const hookCount =
		supportCodeLibrary.beforeTestCaseHookDefinitions.length +
		supportCodeLibrary.afterTestCaseHookDefinitions.length +
		supportCodeLibrary.beforeTestStepHookDefinitions.length +
		supportCodeLibrary.afterTestStepHookDefinitions.length +
		supportCodeLibrary.beforeTestRunHookDefinitions.length +
		supportCodeLibrary.afterTestRunHookDefinitions.length;
	progress.end(
		`${plural(supportCodeLibrary.stepDefinitions.length, 'step definition')}, ${plural(hookCount, 'hook')}` +
			describeTranspileCache()
	);
	// Bound the on-disk transpile cache by size; a no-op unless this run wrote new entries to it
	pruneTranspileCache();

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
	progress.begin(
		'assemble',
		`initializing formatters and parsing ${plural(sourcePaths.length, 'feature file')} into scenarios`,
		sourcePaths.length
	);
	// One progress mark per parsed feature file
	eventBroadcaster.on('envelope', (envelope: Envelope) => {
		if (envelope.gherkinDocument) progress.tick();
	});
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
		progress.finish();
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

	progress.end(`${plural(filteredPickles.length, 'scenario')} to run`);

	emitSupportCodeMessages({
		eventBroadcaster,
		supportCodeLibrary,
		newId
	});

	// The last silent stretch: BeforeAll hooks in serial mode, or every child process loading the support
	// code again in parallel mode. Ends when the first test case starts and the formatter takes over stdout.
	if (options.runtime.parallel > 0) {
		progress.begin(
			'launch',
			`starting ${plural(options.runtime.parallel, 'worker process')}, each loading the support code`,
			options.runtime.parallel
		);
	} else {
		progress.begin('launch', 'running BeforeAll hooks');
	}
	eventBroadcaster.on('envelope', (envelope: Envelope) => {
		if (envelope.testCaseStarted) progress.finish();
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
		resolvedSupportPaths: { requirePaths, importPaths },
		onWorkerReady: () => progress.tick()
	});
	const success = await runtime.run();
	progress.finish();
	recordPhase('runtime:run', phaseStart);
	await pluginManager.cleanup();
	await cleanupFormatters();
	await finishTiming();

	return {
		success: success && !formatterStreamError,
		support: supportCodeLibrary
	};
}
