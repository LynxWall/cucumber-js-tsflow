import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { IdGenerator } from '@cucumber/messages';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import supportCodeLibraryBuilder from '@cucumber/cucumber/lib/support_code_library_builder/index';
import tryRequire from '@cucumber/cucumber/lib/try_require';
import { ILogger } from '@cucumber/cucumber/lib/environment/index';

export async function getSupportCodeLibrary({
	logger,
	cwd,
	newId,
	requireModules,
	requirePaths,
	importPaths,
	loaders
}: {
	logger: ILogger;
	cwd: string;
	newId: IdGenerator.NewId;
	requireModules: string[];
	requirePaths: string[];
	importPaths: string[];
	loaders: string[];
}): Promise<SupportCodeLibrary> {
	supportCodeLibraryBuilder.reset(cwd, newId, {
		requireModules,
		requirePaths,
		importPaths,
		loaders
	});

	// Define the boolean type before loading any support code
	supportCodeLibraryBuilder.defineParameterType({
		name: 'boolean',
		regexp: /true|false/,
		transformer: s => (s === 'true' ? true : false)
	});

	requireModules.map(path => {
		logger.debug(`Attempting to require code from "${path}"`);
		tryRequire(path);
	});
	requirePaths.map(path => {
		logger.debug(`Attempting to require code from "${path}"`);
		tryRequire(path);
	});

	for (const specifier of loaders) {
		logger.debug(`Attempting to register loader "${specifier}"`);
		register(specifier, pathToFileURL('./'));
	}

	for (const path of importPaths) {
		logger.debug(`Attempting to import code from "${path}"`);
		await import(pathToFileURL(path).toString());
	}

	return supportCodeLibraryBuilder.finalize();
}
