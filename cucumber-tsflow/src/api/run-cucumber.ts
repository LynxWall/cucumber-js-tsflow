import { Envelope, IdGenerator, ParseError } from '@cucumber/messages';
import { EventEmitter } from 'events';
import { EventDataCollector } from '@cucumber/cucumber/lib/formatter/helpers/index';
import { emitMetaMessage, emitSupportCodeMessages } from '@cucumber/cucumber/lib/api/emit_support_code_messages';
import { IRunOptions, IRunResult } from '@cucumber/cucumber/lib/api/types';
import { resolvePaths } from '@cucumber/cucumber/lib/paths/index';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import { makeRuntime } from '../runtime/make-runtime';
import { initializeFormatters } from '@cucumber/cucumber/lib/api/formatters';
import { composeRecorders, getSupportCodeLibrary } from './support';
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
import { SelectiveLoadSession } from './selective-load';
import type { SupportReloader } from './support-reloader';

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
 * State a caller keeps across several `runCucumber` calls in one process (the CLI's watch mode does).
 * Without it every call is a one-shot run: it loads the support code as a fresh process would.
 *
 * @public
 */
export interface ITsFlowRunSession {
	/** Keeps the support modules loaded between runs and re-evaluates only what must run again. */
	reloader?: SupportReloader;
	/** Files changed since the previous run, for the reloader. */
	changedPaths?: readonly string[];
}

/**
 * Execute a Cucumber test run.
 *
 * Extended from cucumber.js so that we can use our own implementation
 * of makeRuntime
 *
 * @public
 * @param options - Configuration loaded from `loadConfiguration`. `options.support` is replaced by the
 * loaded library, so a caller running more than once passes a fresh copy each time.
 * @param environment - Project environment.
 * @param onMessage - Callback fired each time Cucumber emits a message.
 * @param session - State kept across runs of a resident process; see `ITsFlowRunSession`.
 */
export async function runCucumber(
	options: ITsFlowRunOptions,
	environment: IRunEnvironment = {},
	onMessage?: (message: Envelope) => void,
	session?: ITsFlowRunSession
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
	 * Feature files are parsed before the support code loads, so that a filtered run knows which scenarios
	 * it will execute before paying for the support tree (selective loading decides what to load from
	 * them). Formatters do not exist yet, so the Gherkin envelopes are buffered and emitted once they do,
	 * in the same order as before: meta, then source / gherkinDocument / pickle, then the support code.
	 */
	const gherkinEnvelopes: Envelope[] = [];
	let filteredPickles: ReadonlyArray<IFilterablePickle> = [];
	let parseErrors: ParseError[] = [];
	progress.begin('parse', `parsing ${plural(sourcePaths.length, 'feature file')} into scenarios`, sourcePaths.length);
	let phaseStart = startTimer();
	if (sourcePaths.length > 0) {
		const gherkinResult = await getPicklesAndErrors({
			newId,
			cwd,
			sourcePaths,
			coordinates: options.sources,
			onEnvelope: envelope => {
				gherkinEnvelopes.push(envelope);
				// One progress mark per parsed feature file
				if (envelope.gherkinDocument) progress.tick();
			}
		});
		filteredPickles = await pluginManager.transform('pickles:filter', gherkinResult.filterablePickles);
		filteredPickles = await pluginManager.transform('pickles:order', filteredPickles);
		parseErrors = gherkinResult.parseErrors;
	}
	recordPhase('gherkin', phaseStart);
	progress.end(
		parseErrors.length > 0
			? plural(parseErrors.length, 'parse error')
			: `${plural(filteredPickles.length, 'scenario')} to run`
	);

	/**
	 * The support code library contains all of the hook and step definitions.
	 * These are loaded into the library when calling getSupportCodeLibrary,
	 * which loads all of the step definitions using require or import.
	 *
	 * With `selectiveLoad`, only the support files the selected scenarios need are loaded (plus every file
	 * that registers anything other than step definitions), decided from an index that earlier runs wrote.
	 * The loaded lists are also what parallel children load, so definition ids line up.
	 */
	let loadRequirePaths = requirePaths;
	let loadImportPaths = importPaths;
	let selectiveLoad: SelectiveLoadSession | undefined;
	let loadNote = '';
	const alreadyLoaded = 'originalCoordinates' in options.support;

	// A resident process (watch mode): make the modules that must run again load again, keep the rest
	const reloader = alreadyLoaded ? undefined : session?.reloader;
	const reload = reloader?.prepare(session?.changedPaths ?? [], sourcePaths, requirePaths, importPaths);
	if (reload) {
		const others = reload.modules > 0 ? `, ${plural(reload.modules, 'other module')}` : '';
		loadNote += ` (rerun ${reload.generation}: ${reload.reevaluated} evaluated again, ${reload.kept} kept loaded${others})`;
	}

	if (options.runtime.selectiveLoad && !alreadyLoaded) {
		const unsupported = SelectiveLoadSession.unsupportedReason(supportCoordinates);
		if (unsupported) {
			loadNote += ` (selective load unavailable: ${unsupported})`;
			runLogger.checkpoint('Selective load unavailable', { reason: unsupported });
		} else {
			selectiveLoad = new SelectiveLoadSession(
				cwd,
				supportCoordinates,
				options.runtime.experimentalDecorators,
				requirePaths,
				importPaths
			);
			const plan =
				parseErrors.length > 0
					? selectiveLoad.fullPlan('feature files have parse errors')
					: selectiveLoad.plan(filteredPickles.map(filterable => filterable.pickle));
			loadRequirePaths = plan.requirePaths;
			loadImportPaths = plan.importPaths;
			loadNote += plan.reason
				? ` (selective load: ${plan.reason})`
				: ` (${plan.skipped} skipped: not used by the selected scenarios)`;
			runLogger.checkpoint('Selective load plan', { skipped: plan.skipped, reason: plan.reason });
		}
	}
	const loadCount = loadRequirePaths.length + loadImportPaths.length;

	let supportCodeLibrary: SupportCodeLibrary;
	try {
		supportCodeLibrary =
			'originalCoordinates' in options.support
				? (options.support as SupportCodeLibrary)
				: await (async () => {
						const transpiler = describeTranspiler(supportCoordinates.requireModules, supportCoordinates.loaders);
						const files =
							loadCount < supportFileCount
								? `${loadCount} of ${plural(supportFileCount, 'support file')}`
								: plural(supportFileCount, 'support file');
						progress.begin(
							'load',
							`transpiling and loading ${files}` + (transpiler ? ` with ${transpiler}` : '') + loadNote,
							loadCount
						);
						return getSupportCodeLibrary({
							logger,
							cwd,
							newId,
							requirePaths: loadRequirePaths,
							requireModules: supportCoordinates.requireModules,
							importPaths: loadImportPaths,
							loaders: supportCoordinates.loaders,
							reevaluate: reload?.files,
							onFileLoaded: () => progress.tick(),
							recorder: composeRecorders(selectiveLoad, reloader)
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
		selectiveLoad?.finish(supportCodeLibrary);
		reloader?.finish();
	} catch (err) {
		selectiveLoad?.abort();
		reloader?.abort();
		// Close the open progress line as failed so the error that follows starts on its own line, and stop the spinner
		progress.fail();
		progress.finish();
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

	// Replay the parsed feature files to the formatters and plugins, in the order they were produced
	for (const envelope of gherkinEnvelopes) {
		eventBroadcaster.emit('envelope', envelope);
	}
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

	emitSupportCodeMessages({
		eventBroadcaster,
		supportCodeLibrary,
		newId
	});

	// The last silent stretch. In parallel mode every child process loads the support code again, and the phase
	// ends when the first test case starts and the formatter takes over stdout. In serial mode it covers assembling
	// the test cases and ends before the first BeforeAll hook runs: what a hook prints then starts on its own row
	// instead of landing on the open phase line, where a redraw would erase it.
	const serial = options.runtime.parallel === 0;
	if (serial) {
		progress.begin('launch', `assembling ${plural(filteredPickles.length, 'test case')}`);
	} else {
		progress.begin(
			'launch',
			`starting ${plural(options.runtime.parallel, 'worker process')}, each loading the support code`,
			options.runtime.parallel
		);
	}
	eventBroadcaster.on('envelope', (envelope: Envelope) => {
		if (envelope.testCaseStarted || (serial && envelope.testRunHookStarted)) progress.finish();
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
		resolvedSupportPaths: { requirePaths: loadRequirePaths, importPaths: loadImportPaths },
		onWorkerReady: () => progress.tick()
	});
	let success: boolean;
	try {
		success = await runtime.run();
	} catch (err) {
		// A BeforeAll or AfterAll hook threw: close the open phase line as failed so the error starts on its own line
		progress.fail();
		progress.finish();
		throw err;
	}
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
