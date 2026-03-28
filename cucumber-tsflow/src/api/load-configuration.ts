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
import { hasStringValue } from '../utils/helpers';
import GherkinManager from '../gherkin/gherkin-manager';
import ansis from 'ansis';
import { ITsFlowRunConfiguration } from '../runtime/types';
import { Console } from 'console';
import { join } from 'path';
import { createLogger } from '../utils/tsflow-logger';

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
		logger.error('Failed to create environment', error);
		throw new Error(`Failed to create environment: ${error.message}`, { cause: error });
	}

	// Locate config file
	let configFile: string | false | undefined;
	try {
		logger.checkpoint('Locating config file', { providedFile: options.file });
		configFile = options.file ?? locateFile(cwd);
		logger.checkpoint('Config file resolved', { configFile });
	} catch (error: any) {
		logger.error('Failed to locate config file', error);
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

	const consoleLogger = new Console(environment.stdout as any, environment.stderr);
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
			logger.error('Failed to load configuration from file', error, { configFile });
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
		logger.error('Failed to merge configurations', error);
		throw new Error(`Failed to merge configurations: ${error.message}`, { cause: error });
	}

	// Configure experimental decorators
	if (original.experimentalDecorators === undefined) {
		original.experimentalDecorators = false;
	}
	const experimentalDecorators = original.experimentalDecorators;
	global.experimentalDecorators = experimentalDecorators;
	process.env.CUCUMBER_EXPERIMENTAL_DECORATORS = String(experimentalDecorators);

	logger.checkpoint('Experimental decorators configured', { experimentalDecorators });

	// Configure parallel loading
	if (original.parallelLoad === undefined) {
		original.parallelLoad = false;
	}
	logger.checkpoint('Parallel load configured', { parallelLoad: original.parallelLoad });

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
			logger.error('Failed to configure transpiler', error, { transpiler: original.transpiler });
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
		for (let idx = 0; idx < original.format.length; idx++) {
			if (typeof original.format[idx] === 'string') {
				const formatItem = original.format[idx] as string;
				if (formatItem.startsWith('behave:')) {
					original.format[idx] = formatItem.replace('behave', '@lynxwall/cucumber-tsflow/behave');
					logger.checkpoint('Replaced behave format', { index: idx });
				}
			} else if (original.format[idx].length > 0) {
				const formatItem = original.format[idx][0] as string;
				if (formatItem.startsWith('behave')) {
					const newVal = formatItem.replace('behave', '@lynxwall/cucumber-tsflow/behave');
					original.format[idx] = original.format[idx].length > 1 ? [newVal, original.format[idx][1]] : [newVal];
					logger.checkpoint('Replaced behave format (array)', { index: idx });
				}
			}
		}

		for (let idx = 0; idx < original.format.length; idx++) {
			if (typeof original.format[idx] === 'string') {
				const formatItem = original.format[idx] as string;
				if (formatItem.startsWith('junitbamboo:')) {
					original.format[idx] = formatItem.replace('junitbamboo', '@lynxwall/cucumber-tsflow/junitbamboo');
					logger.checkpoint('Replaced junitbamboo format', { index: idx });
				}
			} else if (original.format[idx].length > 0) {
				const formatItem = original.format[idx][0] as string;
				if (formatItem.startsWith('junitbamboo')) {
					const newVal = formatItem.replace('junitbamboo', '@lynxwall/cucumber-tsflow/junitbamboo');
					original.format[idx] = original.format[idx].length > 1 ? [newVal, original.format[idx][1]] : [newVal];
					logger.checkpoint('Replaced junitbamboo format (array)', { index: idx });
				}
			}
		}
		logger.checkpoint('Format options processed');
	} catch (error: any) {
		logger.error('Failed to process format options', error);
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
			logger.error('Failed to process debugFile', error, { debugFile: original.debugFile });
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
		logger.error('Configuration validation failed', error);
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
		logger.error('Failed to convert configuration', error);
		throw new Error(`Failed to convert configuration: ${error.message}`, { cause: error });
	}

	logger.checkpoint('loadConfiguration() completed');

	return {
		useConfiguration: original,
		runConfiguration: runnable
	};
};
