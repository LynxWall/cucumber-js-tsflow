import { IdGenerator } from '@cucumber/messages';
import { resolvePaths } from '@cucumber/cucumber/lib/paths/index';
import { IRunEnvironment, makeEnvironment } from '@cucumber/cucumber/lib/environment/index';
import { ILoadSupportOptions, ISupportCodeLibrary } from '@cucumber/cucumber/lib/api/types';
import { getSupportCodeLibrary } from './support';
import { initializeForLoadSupport } from '@cucumber/cucumber/lib/api/plugins';
import { BindingRegistry } from '../bindings/binding-registry';

/**
 * Load support code for use in test runs
 *
 * @public
 * @param options - Options required to find the support code
 * @param environment - Project environment
 */
export async function loadSupport(
	options: ILoadSupportOptions,
	environment: IRunEnvironment = {}
): Promise<ISupportCodeLibrary> {
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
	let supportCodeLibrary = await getSupportCodeLibrary({
		logger,
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
