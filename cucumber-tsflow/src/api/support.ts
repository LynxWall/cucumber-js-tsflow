import { messageOf } from '../utils/tsflow-logger';
import { pathToFileURL } from 'node:url';
import { IdGenerator } from '@cucumber/messages';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import supportCodeLibraryBuilder from '@cucumber/cucumber/lib/support_code_library_builder/index';
import tryRequire from '@cucumber/cucumber/lib/try_require';
import { ILogger } from '@cucumber/cucumber/lib/environment/index';
import { resetStepPatternRegistrations } from '../bindings/binding-decorator';
import { startTimer, recordPhase, recordFile } from '../utils/tsflow-timing';
import { versionedUrl } from '../utils/module-graph';
import { registerLoader } from './register-loaders';

/** How a support file is loaded: a `require` path or an `import` path. */
export type SupportFileKind = 'require' | 'import';

/**
 * Observes each support file's load, from just before its `require`/`import` to just after it returns.
 * Everything a file registers happens synchronously between the two calls, which is what selective
 * loading relies on to attribute bindings to files.
 */
export interface SupportLoadRecorder {
	/** A support file is about to be required or imported. Calls come in begin/end pairs and never nest. */
	beginFile(path: string, kind: SupportFileKind): void;
	/** The file the preceding `beginFile()` named has finished evaluating. */
	endFile(): void;
}

/** One recorder that forwards to every given one, in order; undefined when none is given. */
export function composeRecorders(
	...recorders: Array<SupportLoadRecorder | undefined>
): SupportLoadRecorder | undefined {
	const present = recorders.filter((recorder): recorder is SupportLoadRecorder => recorder !== undefined);
	if (present.length === 0) return undefined;
	if (present.length === 1) return present[0];
	return {
		beginFile: (path, kind) => present.forEach(recorder => recorder.beginFile(path, kind)),
		endFile: () => present.forEach(recorder => recorder.endFile())
	};
}

export async function getSupportCodeLibrary({
	logger,
	cwd,
	newId,
	requireModules,
	requirePaths,
	importPaths,
	loaders,
	onFileLoaded,
	recorder
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
	/** Bracketed around each support file's load; used by selective loading to record what each file registers */
	recorder?: SupportLoadRecorder;
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
		recorder?.beginFile(path, 'require');
		tryRequire(path);
		recorder?.endFile();
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
		recorder?.beginFile(path, 'import');
		// In a resident process (watch mode) a file to evaluate again carries a version query; see module-graph.ts
		try {
			await import(versionedUrl(pathToFileURL(path).toString()));
		} catch (error) {
			// A loader on Node's loader hooks thread cannot transfer its own error classes: they arrive here as an empty
			// object with no prototype. Name the file, which the value itself no longer can; a real Error passes as is.
			if (Object.prototype.toString.call(error) !== '[object Error]') {
				throw new Error(`Failed to import support file "${path}": ${messageOf(error)}`, { cause: error });
			}
			throw error;
		}
		recorder?.endFile();
		recordFile('import', path, fileStart);
		onFileLoaded?.(path);
	}
	recordPhase('support:import', phaseStart);

	phaseStart = startTimer();
	const library = supportCodeLibraryBuilder.finalize();
	recordPhase('support:finalize', phaseStart);
	return library;
}
