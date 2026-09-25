import { ILoadConfigurationOptions } from '@cucumber/cucumber/lib/api/types';
import { locateFile } from '@cucumber/cucumber/lib/configuration/locate_file';
import {
	DEFAULT_CONFIGURATION,
	fromFile,
	IConfiguration,
	parseConfiguration,
	mergeConfigurations
} from '@cucumber/cucumber/lib/configuration/index';
import { validateConfiguration } from '@cucumber/cucumber/lib/configuration/validate_configuration';
import { convertConfiguration } from './convert-configuration';
import { IRunEnvironment, makeEnvironment } from '@cucumber/cucumber/lib/environment/index';
import { ITsflowConfiguration } from '../cli/argv-parser';
import { setExperimentalDecorators } from '../utils/decorator-mode';
import { hasStringValue } from '../utils/helpers';
import GherkinManager from '../gherkin/gherkin-manager';
import ansis from 'ansis';
import { ITsFlowRunConfiguration } from '../runtime/types';
import { Console } from 'console';
import { join } from 'path';
import { createLogger, describeThrowable } from '../utils/tsflow-logger';

const logger = createLogger('config');

export interface ITsflowResolvedConfiguration {
	/**
	 * The final flat configuration object resolved from the configuration file/profiles plus any extra provided.
	 */
	useConfiguration: ITsflowConfiguration;
	/**
	 * The format that can be passed into `runCucumber`.
	 */
	runConfiguration: ITsFlowRunConfiguration;
}

/**
 * Load user-authored configuration to be used in a test run.
 *
 * @public
 * @param options - Coordinates required to find configuration.
 * @param environment - Project environment.
 */
export const loadConfiguration = async (
	options: ILoadConfigurationOptions = {},
	environment: IRunEnvironment = {}
): Promise<ITsflowResolvedConfiguration> => {
	logger.checkpoint('loadConfiguration() started', {
		optionsFile: options.file,
		optionsProfiles: options.profiles
	});

	let cwd: string;
	let env: typeof process.env;
	let cucumberLogger: any;

	try {
		logger.checkpoint('Creating environment');
		const made = makeEnvironment(environment);
		cwd = made.cwd;
		env = made.env;
		cucumberLogger = made.logger;
		logger.checkpoint('Environment created', { cwd });
	} catch (error: any) {
		// Each error below propagates to the CLI, which reports it once; only the verbose trail keeps a copy here
		logger.checkpoint('Failed to create environment', { error: describeThrowable(error) });
		throw new Error(`Failed to create environment: ${error.message}`, { cause: error });
	}

	// Locate config file
	let configFile: string | false | undefined;
	try {
		logger.checkpoint('Locating config file', { providedFile: options.file });
		configFile = options.file ?? locateFile(cwd);
		logger.checkpoint('Config file resolved', { configFile });
	} catch (error: any) {
		logger.checkpoint('Failed to locate config file', { error: describeThrowable(error) });
		throw new Error(`Failed to locate configuration file: ${error.message}`, { cause: error });
	}

	let msg = '';
	if (configFile) {
		msg = `Loading configuration from "${configFile}".`;
	} else if (configFile === false) {
		msg = 'Skipping configuration file resolution';
	} else {
		msg = 'No configuration file found';
	}

	// All of cucumber-tsflow's own output goes to stderr; stdout carries only formatter output
	const consoleLogger = new Console((environment.stderr ?? process.stderr) as any);
	cucumberLogger.debug(msg);
	consoleLogger.log(ansis.cyanBright(msg));

	// Load profile configuration from file
	let profileConfiguration: Partial<IConfiguration> = {};
	if (configFile) {
		try {
			logger.checkpoint('Loading configuration from file', {
				configFile,
				profiles: options.profiles
			});
			profileConfiguration = await fromFile(cucumberLogger, cwd, configFile, options.profiles);
			logger.checkpoint('Profile configuration loaded', {
				keys: Object.keys(profileConfiguration),
				transpiler: (profileConfiguration as any).transpiler,
				paths: (profileConfiguration as any).paths
			});
		} catch (error: any) {
			logger.checkpoint('Failed to load configuration from file', { configFile, error: describeThrowable(error) });
			throw new Error(`Failed to load configuration from "${configFile}": ${error.message}`, { cause: error });
		}
	}

	// If a feature was passed in on command line, clear profile paths
	const paths = (options.provided as Partial<IConfiguration>)?.paths;
	if (paths && paths?.length > 0) {
		logger.checkpoint('Clearing profile paths (feature passed via CLI)', { providedPaths: paths });
		profileConfiguration.paths = [];
	}

	// Merge configurations
	let original: ITsflowConfiguration;
	try {
		logger.checkpoint('Merging configurations');
		const parsedProvided = parseConfiguration(cucumberLogger, 'Provided', options.provided);
		logger.checkpoint('Provided configuration parsed', { parsedKeys: Object.keys(parsedProvided) });

		original = mergeConfigurations(DEFAULT_CONFIGURATION, profileConfiguration, parsedProvided) as ITsflowConfiguration;

		logger.checkpoint('Configurations merged', {
			transpiler: original.transpiler,
			experimentalDecorators: original.experimentalDecorators,
			pathCount: original.paths?.length
		});
	} catch (error: any) {
		logger.checkpoint('Failed to merge configurations', { error: describeThrowable(error) });
		throw new Error(`Failed to merge configurations: ${error.message}`, { cause: error });
	}

	// Configure experimental decorators
	if (original.experimentalDecorators === undefined) {
		original.experimentalDecorators = false;
	}
	const experimentalDecorators = original.experimentalDecorators;
	setExperimentalDecorators(experimentalDecorators);

	logger.checkpoint('Experimental decorators configured', { experimentalDecorators });

	// parallelLoad is accepted for compatibility and ignored: the preload phase it enabled was removed.
	if (original.parallelLoad) {
		const setBy =
			(options.provided as Partial<ITsflowConfiguration> | undefined)?.parallelLoad !== undefined
				? 'the --parallel-load flag from the command line'
				: `"parallelLoad" from ${configFile ? `"${configFile}"` : 'the cucumber configuration file'}`;
		consoleLogger.log(parallelLoadDeprecationNotice(setBy));
		logger.checkpoint('parallelLoad is set but ignored', { parallelLoad: original.parallelLoad });
	}

	// Configure the on-disk transpile cache. The environment variable is how the setting reaches the
	// transpilers, the ESM loader hooks (in-thread or on the hooks thread) and parallel children; an
	// environment value already present acts as the default when the option is not set.
	if (original.transpileCache === undefined) {
		original.transpileCache = process.env.TSFLOW_TRANSPILE_CACHE !== 'false';
	}
	process.env.TSFLOW_TRANSPILE_CACHE = String(original.transpileCache);
	logger.checkpoint('Transpile cache configured', { transpileCache: original.transpileCache });

	// Selective support loading is opt-in; `TSFLOW_SELECTIVE_LOAD=true` is the default when the option is unset.
	// Unlike `transpileCache`, the value is not written back to the environment: nothing reads it there. It travels
	// in the run configuration (`runtime.selectiveLoad`), and parallel children are sent the chosen subset of
	// support files by the coordinator rather than deciding it themselves.
	if (original.selectiveLoad === undefined) {
		original.selectiveLoad = process.env.TSFLOW_SELECTIVE_LOAD === 'true';
	}
	logger.checkpoint('Selective load configured', { selectiveLoad: original.selectiveLoad });

	/**
	 * Ensures JSDOM environment is initialized before any test files are loaded.
	 */
	const initJsDom = () => {
		logger.checkpoint('Initializing JSDOM setup');
		try {
			const setupPath = require.resolve('@lynxwall/cucumber-tsflow/lib/transpilers/esm/vue-jsdom-setup');
			logger.checkpoint('JSDOM setup path resolved', { setupPath });
			original.require.unshift(setupPath);
		} catch (e: any) {
			logger.checkpoint('require.resolve failed, using fallback', { error: e.message });
			const setupPath = join(__dirname, '../../transpilers/esm/vue-jsdom-setup.mjs');
			logger.checkpoint('JSDOM setup fallback path', { setupPath });
			original.require.unshift(setupPath);
		}
	};

	// Configure transpiler
	if (original.transpiler) {
		logger.checkpoint('Configuring transpiler', { transpiler: original.transpiler });
		try {
			switch (original.transpiler) {
				case 'es-vue':
					logger.checkpoint('Adding es-vue requireModule');
					original.requireModule.push('@lynxwall/cucumber-tsflow/lib/transpilers/esvue');
					break;
				case 'ts-vue': {
					const module = experimentalDecorators ? 'tsvue-exp' : 'tsvue';
					logger.checkpoint('Adding ts-vue requireModule', { module });
					original.requireModule.push(`@lynxwall/cucumber-tsflow/lib/transpilers/${module}`);
					break;
				}
				case 'es-node':
					logger.checkpoint('Adding es-node requireModule');
					original.requireModule.push('@lynxwall/cucumber-tsflow/lib/transpilers/esnode');
					break;
				case 'ts-node': {
					const module = experimentalDecorators ? 'tsnode-exp' : 'tsnode';
					logger.checkpoint('Adding ts-node requireModule', { module });
					original.requireModule.push(`@lynxwall/cucumber-tsflow/lib/transpilers/${module}`);
					break;
				}
				case 'ts-node-esm':
					logger.checkpoint('Adding ts-node-esm loader');
					original.loader.push('@lynxwall/cucumber-tsflow/lib/transpilers/esm/tsnode-loader');
					break;
				case 'es-node-esm':
					logger.checkpoint('Adding es-node-esm loader');
					original.loader.push('@lynxwall/cucumber-tsflow/lib/transpilers/esm/esnode-loader');
					break;
				case 'ts-vue-esm':
					logger.checkpoint('Adding ts-vue-esm loader + JSDOM');
					original.loader.push('@lynxwall/cucumber-tsflow/lib/transpilers/esm/vue-loader');
					initJsDom();
					break;
				case 'es-vue-esm':
					logger.checkpoint('Adding es-vue-esm loader + JSDOM');
					original.loader.push('@lynxwall/cucumber-tsflow/lib/transpilers/esm/esvue-loader');
					initJsDom();
					break;
				default:
					logger.checkpoint('No built-in transpiler (user-provided expected)', {
						transpiler: original.transpiler
					});
					break;
			}
			logger.checkpoint('Transpiler configured', {
				loaders: original.loader,
				requireModules: original.requireModule,
				requires: original.require
			});
		} catch (error: any) {
			logger.checkpoint('Failed to configure transpiler', {
				transpiler: original.transpiler,
				error: describeThrowable(error)
			});
			throw new Error(`Failed to configure transpiler "${original.transpiler}": ${error.message}`, { cause: error });
		}
	} else {
		logger.checkpoint('No transpiler specified');
	}

	// Set snippet syntax
	if (!original.formatOptions.snippetSyntax) {
		original.formatOptions.snippetSyntax = '@lynxwall/cucumber-tsflow/snippet';
	}
	logger.checkpoint('Snippet syntax configured', { snippetSyntax: original.formatOptions.snippetSyntax });

	// Process format options
	logger.checkpoint('Processing format options', { formatCount: original.format?.length });
	try {
		const replaceFormatAlias = (alias: string, replacement: string) => {
			for (let idx = 0; idx < original.format.length; idx++) {
				if (typeof original.format[idx] === 'string') {
					const formatItem = original.format[idx] as string;
					if (formatItem.startsWith(`${alias}:`)) {
						original.format[idx] = formatItem.replace(alias, replacement);
						logger.checkpoint(`Replaced ${alias} format`, { index: idx });
					}
				} else if (original.format[idx].length > 0) {
					const formatItem = original.format[idx][0] as string;
					if (formatItem.startsWith(alias)) {
						const newVal = formatItem.replace(alias, replacement);
						original.format[idx] = original.format[idx].length > 1 ? [newVal, original.format[idx][1]] : [newVal];
						logger.checkpoint(`Replaced ${alias} format (array)`, { index: idx });
					}
				}
			}
		};

		replaceFormatAlias('behave', '@lynxwall/cucumber-tsflow/behave');
		replaceFormatAlias('junitbamboo', '@lynxwall/cucumber-tsflow/junitbamboo');
		logger.checkpoint('Format options processed');
	} catch (error: any) {
		logger.checkpoint('Failed to process format options', { error: describeThrowable(error) });
		throw new Error(`Failed to process format options: ${error.message}`, { cause: error });
	}

	// Process debugFile
	if (hasStringValue(original.debugFile)) {
		logger.checkpoint('Processing debugFile', { debugFile: original.debugFile });
		try {
			const gherkin = new GherkinManager();
			await gherkin.loadFeatures(original.paths);
			const features = gherkin.findFeaturesByStepFile(original.debugFile);
			if (features.length > 0) {
				original.paths = [];
				features.forEach(x => original.paths.push(x.featureFile));
				logger.checkpoint('Debug features found', { featureCount: features.length });
			} else {
				cucumberLogger.warn(ansis.yellow(`\nUnable to find feature for debugFile: ${original.debugFile}`));
				cucumberLogger.warn(ansis.yellow('All tests will be executed\n'));
				logger.checkpoint('No features found for debugFile');
			}
		} catch (error: any) {
			logger.checkpoint('Failed to process debugFile', {
				debugFile: original.debugFile,
				error: describeThrowable(error)
			});
			throw new Error(`Failed to process debugFile "${original.debugFile}": ${error.message}`, { cause: error });
		}
	}

	// Configure Vue style
	if (original.enableVueStyle === null || original.enableVueStyle === undefined) {
		original.enableVueStyle = false;
	}
	global.enableVueStyle = original.enableVueStyle;
	logger.checkpoint('Vue style configured', { enableVueStyle: original.enableVueStyle });

	// Validate configuration
	try {
		logger.checkpoint('Validating configuration');
		validateConfiguration(original, cucumberLogger);
		logger.checkpoint('Configuration validated');
	} catch (error: any) {
		logger.checkpoint('Configuration validation failed', { error: describeThrowable(error) });
		throw new Error(`Configuration validation failed: ${error.message}`, { cause: error });
	}

	// Convert configuration
	let runnable: ITsFlowRunConfiguration;
	try {
		logger.checkpoint('Converting configuration');
		runnable = await convertConfiguration(cucumberLogger, original, env);
		logger.checkpoint('Configuration converted', {
			importPaths: runnable.support?.importPaths,
			loaders: runnable.support?.loaders
		});
	} catch (error: any) {
		logger.checkpoint('Failed to convert configuration', { error: describeThrowable(error) });
		throw new Error(`Failed to convert configuration: ${error.message}`, { cause: error });
	}

	logger.checkpoint('loadConfiguration() completed');

	return {
		useConfiguration: original,
		runConfiguration: runnable
	};
};

/**
 * The notice printed when a configuration still sets `parallelLoad`. Deliberately loud — a blank line, a row
 * of stars, a blank line, then the notice — so it is not lost among the startup lines.
 */
function parallelLoadDeprecationNotice(setBy: string): string {
	return [
		'',
		'**********',
		'',
		`${ansis.bold('DEPRECATION NOTICE:')} the parallelLoad option is no longer used and has no effect. ` +
			'Parallel preloading of support files was removed because it made every run slower; the on-disk ' +
			'transpile cache now does the work it was meant to do, with nothing to configure. ' +
			`Remove ${setBy} to clear this notice.`,
		''
	].join('\n');
}
