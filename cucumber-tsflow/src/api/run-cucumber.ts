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
import path from 'path';
import ansis from 'ansis';
import { runPrebuild, mapToPrebuildPaths } from './prebuilder';
import { createLogger } from '../utils/tsflow-logger';

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
	let { sourcePaths, requirePaths, importPaths } = resolvedPaths;

	// Handle Prebuild logic
	if (options.runtime.prebuild && !('originalCoordinates' in options.support)) {
		const outdir = path.join(cwd, '.tsflow-build');

		consoleLogger.info(ansis.cyanBright('Running AOT Prebuild (bypassing runtime transpilers)...\n'));
		await runPrebuild({
			cwd,
			outdir,
			watch: options.runtime.watch,
			format: supportCoordinates.loaders.length > 0 ? 'esm' : 'cjs'
		});

		runLogger.checkpoint('Prebuild completed, remapping paths', { outdir });

		// Remap paths to the .tsflow-build directory
		requirePaths = mapToPrebuildPaths(requirePaths, cwd, outdir);
		importPaths = mapToPrebuildPaths(importPaths, cwd, outdir);

		// If we are prebuilding, we should also bypass loaders / transpilation require hooks
		// since the code is already valid JS. For Vue transpilers, swap in the standalone
		// jsdom-setup module so the DOM environment is available without loading ts-node/esbuild hooks.
		const vueTranspilerIdx = supportCoordinates.requireModules.findIndex(
			(m: string) => m.includes('tsflow/lib/transpilers/') && /vue/.test(m)
		);
		if (vueTranspilerIdx !== -1) {
			// Replace the Vue transpiler with the lightweight jsdom-setup module
			supportCoordinates.requireModules[vueTranspilerIdx] = supportCoordinates.requireModules[vueTranspilerIdx].replace(
				/\/transpilers\/.*$/,
				'/transpilers/vue-jsdom-setup'
			);
		}
		supportCoordinates.requireModules = supportCoordinates.requireModules.filter(
			(m: string) => !m.includes('tsflow/lib/transpilers/') || m.includes('vue-jsdom-setup')
		);
		supportCoordinates.loaders = [];
	}

	/**
	 * The support code library contains all of the hook and step definitions.
	 * These are loaded into the library when calling getSupportCodeLibrary,
	 * which loads all of the step definitions using require or import.
	 */
	let supportCodeLibrary =
		'originalCoordinates' in options.support
			? (options.support as SupportCodeLibrary)
			: await (async () => {
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
	supportCodeLibrary = BindingRegistry.instance.updateSupportCodeLibrary(supportCodeLibrary);
	supportCodeLibrary = { ...supportCodeLibrary, ...{ originalCoordinates: supportCoordinates } };
	options.support = supportCodeLibrary;

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

	let filteredPickles: ReadonlyArray<IFilterablePickle> = [];
	let parseErrors: ParseError[] = [];
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
	if (parseErrors.length) {
		parseErrors.forEach(parseError => {
			logger.error(`Parse error in "${parseError.source.uri}" ${parseError.message}`);
		});
		await cleanupFormatters();
		await pluginManager.cleanup();
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

	const runtime = await makeRuntime({
		environment,
		logger,
		eventBroadcaster,
		sourcedPickles: filteredPickles,
		newId,
		supportCodeLibrary,
		options: options.runtime,
		coordinates: options.sources
	});
	const success = await runtime.run();
	await pluginManager.cleanup();
	await cleanupFormatters();

	return {
		success: success && !formatterStreamError,
		support: supportCodeLibrary
	};
}
