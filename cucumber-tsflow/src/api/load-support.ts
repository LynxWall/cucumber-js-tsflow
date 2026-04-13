import { IdGenerator } from '@cucumber/messages';
import { resolvePaths } from '@cucumber/cucumber/lib/paths/index';
import { IRunEnvironment, makeEnvironment } from '@cucumber/cucumber/lib/environment/index';
import { ILoadSupportOptions, ISupportCodeLibrary } from '@cucumber/cucumber/lib/api/types';
import type { ISupportCodeCoordinates } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import { getSupportCodeLibrary } from './support';
import { initializeForLoadSupport } from '@cucumber/cucumber/lib/api/plugins';
import { BindingRegistry } from '../bindings/binding-registry';
import { createLogger } from '../utils/tsflow-logger';

const logger = createLogger('load-support');

/**
 * Options extending the standard load-support options.
 */
export interface ITsFlowLoadSupportOptions extends ILoadSupportOptions {
	/** Whether experimental decorators are enabled */
	experimentalDecorators?: boolean;
}

/**
 * Load support code for use in test runs
 *
 * @public
 * @param options - Options required to find the support code
 * @param environment - Project environment
 */
export async function loadSupport(
	options: ITsFlowLoadSupportOptions,
	environment: IRunEnvironment = {}
): Promise<ISupportCodeLibrary> {
	const mergedEnvironment = makeEnvironment(environment);
	const { cwd, logger: cucumberLogger } = mergedEnvironment;
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
	const resolvedPaths = await resolvePaths(cucumberLogger, cwd, options.sources, supportCoordinates);
	pluginManager.emit('paths:resolve', resolvedPaths);
	const { requirePaths, importPaths } = resolvedPaths;

	let supportCodeLibrary = await getSupportCodeLibrary({
		logger: cucumberLogger,
		cwd,
		newId,
		requireModules: supportCoordinates.requireModules,
		requirePaths,
		loaders: supportCoordinates.loaders,
		importPaths
	});
	await pluginManager.cleanup();

	// Set support to the updated step and hook definitions
	// in the supportCodeLibrary. We also need to initialize originalCoordinates
	// to support parallel execution.
	supportCodeLibrary = BindingRegistry.instance.updateSupportCodeLibrary(supportCodeLibrary);
	supportCodeLibrary = { ...supportCodeLibrary, ...{ originalCoordinates: supportCoordinates } };

	return supportCodeLibrary;
}

/**
 * Incrementally reload support code. Evicts support modules from Node's
 * require cache so they are re-evaluated (re-running decorator registrations).
 * Transpiler caches (ts-node, swc, etc.) handle skipping recompilation for
 * unchanged files, making this significantly faster than a full loadSupport.
 *
 * @public
 * @param options - The same run options used for the original loadSupport call
 * @param changedPaths - Absolute paths to files that have changed since the
 *                       last load. If empty, all support modules are evicted
 *                       and re-evaluated (equivalent to a full reload).
 * @param environment - Project environment
 */
export async function reloadSupport(
	options: ITsFlowLoadSupportOptions,
	changedPaths: string[],
	environment: IRunEnvironment = {}
): Promise<ISupportCodeLibrary> {
	const mergedEnvironment = makeEnvironment(environment);
	const { cwd, logger: cucumberLogger } = mergedEnvironment;
	const newId = IdGenerator.uuid();
	const supportCoordinates: ISupportCodeCoordinates = Object.assign(
		{
			requireModules: [],
			requirePaths: [],
			loaders: [],
			importPaths: []
		},
		options.support
	);
	const pluginManager = await initializeForLoadSupport(mergedEnvironment);
	const resolvedPaths = await resolvePaths(cucumberLogger, cwd, options.sources, supportCoordinates);
	pluginManager.emit('paths:resolve', resolvedPaths);
	const { requirePaths, importPaths } = resolvedPaths;

	// Evict support modules from require.cache so they re-evaluate on next require().
	// Transpiler caches ensure unchanged files don't pay recompilation cost.
	if (changedPaths.length > 0) {
		evictChangedAndDependents(changedPaths, requirePaths);
	} else {
		evictAllSupportModules(requirePaths);
	}

	let supportCodeLibrary = await getSupportCodeLibrary({
		logger: cucumberLogger,
		cwd,
		newId,
		requireModules: supportCoordinates.requireModules,
		requirePaths,
		loaders: supportCoordinates.loaders,
		importPaths
	});
	await pluginManager.cleanup();

	supportCodeLibrary = BindingRegistry.instance.updateSupportCodeLibrary(supportCodeLibrary);
	supportCodeLibrary = { ...supportCodeLibrary, ...{ originalCoordinates: supportCoordinates } };

	return supportCodeLibrary;
}

/**
 * Evict changed files and any support modules that depend on them
 * from Node's require cache.
 */
function evictChangedAndDependents(changedPaths: string[], allSupportPaths: string[]): void {
	// Resolve all changed paths
	const changedResolved = new Set<string>();
	for (const p of changedPaths) {
		try {
			changedResolved.add(require.resolve(p));
		} catch {
			// File may have been deleted — skip
		}
	}

	// Build set of modules to evict: changed files + any support module
	// whose dependency subtree includes a changed file
	const toEvict = new Set<string>(changedResolved);

	// Walk require.cache to find transitive dependents
	let found = true;
	while (found) {
		found = false;
		for (const [key, mod] of Object.entries(require.cache)) {
			if (!toEvict.has(key) && mod?.children?.some(child => toEvict.has(child.id))) {
				toEvict.add(key);
				found = true;
			}
		}
	}

	// Only evict modules that are changed or in the support paths set
	// (don't evict node_modules or unrelated files)
	const supportResolved = new Set(
		allSupportPaths
			.map(p => {
				try {
					return require.resolve(p);
				} catch {
					return '';
				}
			})
			.filter(Boolean)
	);

	for (const key of toEvict) {
		if (changedResolved.has(key) || supportResolved.has(key)) {
			delete require.cache[key];
		}
	}
}

/**
 * Evict all support modules from Node's require cache.
 * Used when no specific changed paths are provided.
 */
function evictAllSupportModules(supportPaths: string[]): void {
	for (const filePath of supportPaths) {
		try {
			const resolved = require.resolve(filePath);
			delete require.cache[resolved];
		} catch {
			// File may not be resolvable — skip
		}
	}
}
