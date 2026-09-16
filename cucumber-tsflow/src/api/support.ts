import { pathToFileURL } from 'node:url';
import { IdGenerator } from '@cucumber/messages';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import supportCodeLibraryBuilder from '@cucumber/cucumber/lib/support_code_library_builder/index';
import tryRequire from '@cucumber/cucumber/lib/try_require';
import { ILogger } from '@cucumber/cucumber/lib/environment/index';
import { resetStepPatternRegistrations } from '../bindings/binding-decorator';
import { startTimer, recordPhase, recordFile } from '../utils/tsflow-timing';
import { registerLoader } from './register-loaders';

export async function getSupportCodeLibrary({
	logger,
	cwd,
	newId,
	requireModules,
	requirePaths,
	importPaths,
	loaders,
	onFileLoaded
}: {
	logger: ILogger;
	cwd: string;
	newId: IdGenerator.NewId;
	requireModules: string[];
	requirePaths: string[];
	importPaths: string[];
	loaders: string[];
	/** Called after each support file (require or import path) has been loaded; used for startup progress */
	onFileLoaded?: (path: string) => void;
}): Promise<SupportCodeLibrary> {
	// Clear the step pattern cache so decorators re-register with the fresh builder
	resetStepPatternRegistrations();

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

	let phaseStart = startTimer();
	requireModules.map(path => {
		logger.debug(`Attempting to require code from "${path}"`);
		tryRequire(path);
	});
	recordPhase('support:require-modules', phaseStart);

	phaseStart = startTimer();
	requirePaths.map(path => {
		logger.debug(`Attempting to require code from "${path}"`);
		const fileStart = startTimer();
		tryRequire(path);
		recordFile('require', path, fileStart);
		onFileLoaded?.(path);
	});
	recordPhase('support:require', phaseStart);

	phaseStart = startTimer();
	for (const specifier of loaders) {
		logger.debug(`Attempting to register loader "${specifier}"`);
		const mode = await registerLoader(specifier);
		logger.debug(`Registered loader "${specifier}" using ${mode} hooks`);
	}
	recordPhase('support:register-loaders', phaseStart);

	phaseStart = startTimer();
	for (const path of importPaths) {
		logger.debug(`Attempting to import code from "${path}"`);
		const fileStart = startTimer();
		await import(pathToFileURL(path).toString());
		recordFile('import', path, fileStart);
		onFileLoaded?.(path);
	}
	recordPhase('support:import', phaseStart);

	phaseStart = startTimer();
	const library = supportCodeLibraryBuilder.finalize();
	recordPhase('support:finalize', phaseStart);
	return library;
}
