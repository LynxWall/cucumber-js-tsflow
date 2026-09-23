import { IdGenerator } from '@cucumber/messages';
import { resolvePaths } from '@cucumber/cucumber/lib/paths/index';
import { IRunEnvironment, makeEnvironment } from '@cucumber/cucumber/lib/environment/index';
import { ILoadSupportOptions, ISupportCodeLibrary } from '@cucumber/cucumber/lib/api/types';
import { getSupportCodeLibrary } from './support';
import { initializeForLoadSupport } from '@cucumber/cucumber/lib/api/plugins';
import { BindingRegistry } from '../bindings/binding-registry';
import { setExperimentalDecorators } from '../utils/decorator-mode';
import { dependentProjectModules } from '../utils/module-graph';
import { canonicalPath } from '../utils/paths';
import { startTimer, recordPhase } from '../utils/tsflow-timing';

/**
 * Options extending the standard load-support options with the decorator mode.
 */
export interface ITsFlowLoadSupportOptions extends ILoadSupportOptions {
	/**
	 * The decorator mode the support files are written for (TypeScript's `experimentalDecorators`). When
	 * given, it is recorded for this process's decorators and transpilers before anything loads, as
	 * `loadConfiguration` records the configured mode for the CLI.
	 */
	experimentalDecorators?: boolean;
}

/**
 * Load support code for use in test runs. A second call in the same process evaluates every support file
 * again (see `getSupportCodeLibrary`), so the library is the one a fresh process would build.
 *
 * @public
 * @param options - Options required to find the support code
 * @param environment - Project environment
 */
export async function loadSupport(
	options: ITsFlowLoadSupportOptions,
	environment: IRunEnvironment = {}
): Promise<ISupportCodeLibrary> {
	return loadSupportCode(options, [], environment);
}

/**
 * Load the support code again in a process that has loaded it before, after `changedPaths` changed on disk.
 * Every support file evaluates again, as does each changed module and every project module that imports or
 * requires one, directly or through others, so that no re-evaluated file keeps a stale dependency; everything
 * else stays loaded, and unchanged files come back from the transpile caches rather than being compiled
 * again. With no changed paths this is `loadSupport`. Intended for a persistent worker process that runs
 * more than once, such as the companion VS Code extension.
 *
 * @public
 * @param options - The same options used for the original `loadSupport` call
 * @param changedPaths - Files changed since the last load, absolute or relative to the working directory
 * @param environment - Project environment
 */
export async function reloadSupport(
	options: ITsFlowLoadSupportOptions,
	changedPaths: readonly string[],
	environment: IRunEnvironment = {}
): Promise<ISupportCodeLibrary> {
	return loadSupportCode(options, changedPaths, environment);
}

async function loadSupportCode(
	options: ITsFlowLoadSupportOptions,
	changedPaths: readonly string[],
	environment: IRunEnvironment
): Promise<ISupportCodeLibrary> {
	if (options.experimentalDecorators !== undefined) setExperimentalDecorators(options.experimentalDecorators);
	const mergedEnvironment = makeEnvironment(environment);
	const { cwd, logger } = mergedEnvironment;
	const newId = IdGenerator.uuid();
	const supportCoordinates = Object.assign(
		{
			requireModules: [],
			requirePaths: [],
			loaders: [],
			importPaths: []
		},
		options.support
	);
	const pluginManager = await initializeForLoadSupport(mergedEnvironment);
	const resolvedPaths = await resolvePaths(logger, cwd, options.sources, supportCoordinates);
	pluginManager.emit('paths:resolve', resolvedPaths);
	const { requirePaths, importPaths } = resolvedPaths;

	// In a process that has loaded before, every support file evaluates again (a cached module registers
	// nothing), and so do the changed modules and every project module that depends on one of them
	const reevaluate = new Set<string>([...requirePaths, ...importPaths].map(canonicalPath));
	if (changedPaths.length > 0) {
		const changed = new Set(changedPaths.map(canonicalPath));
		for (const file of changed) reevaluate.add(file);
		for (const dependent of dependentProjectModules(changed)) reevaluate.add(dependent);
	}

	let supportCodeLibrary = await getSupportCodeLibrary({
		logger,
		cwd,
		newId,
		requireModules: supportCoordinates.requireModules,
		requirePaths,
		loaders: supportCoordinates.loaders,
		importPaths,
		reevaluate
	});
	await pluginManager.cleanup();

	// The registry patches the definitions with the decorator callsites, and originalCoordinates is what lets
	// runCucumber hand the loaded library to parallel child processes
	const updateStart = startTimer();
	supportCodeLibrary = BindingRegistry.instance.updateSupportCodeLibrary(supportCodeLibrary);
	supportCodeLibrary = { ...supportCodeLibrary, ...{ originalCoordinates: supportCoordinates } };
	recordPhase('registry:update', updateStart);

	return supportCodeLibrary;
}
