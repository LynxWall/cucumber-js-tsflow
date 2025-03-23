import { ILoadConfigurationOptions, IRunConfiguration } from '@cucumber/cucumber/lib/api/types';
import { locateFile } from '@cucumber/cucumber/lib/configuration/locate_file';
import {
	DEFAULT_CONFIGURATION,
	fromFile,
	IConfiguration,
	parseConfiguration,
	mergeConfigurations
} from '@cucumber/cucumber/lib/configuration/index';
import { validateConfiguration } from '@cucumber/cucumber/lib/configuration/validate_configuration';
import { convertConfiguration } from '@cucumber/cucumber/lib/api/convert_configuration';
import { IRunEnvironment, makeEnvironment } from '@cucumber/cucumber/lib/environment/index';
import { ITsflowConfiguration } from '../cli/argv-parser';
import { hasStringValue } from '../utils/helpers';
import GherkinManager from '../gherkin/gherkin-manager';
import chalk from 'ansis';
import logger from '../utils/logger';

export interface ITsflowResolvedConfiguration {
	/**
	 * The final flat configuration object resolved from the configuration file/profiles plus any extra provided.
	 */
	useConfiguration: ITsflowConfiguration;
	/**
	 * The format that can be passed into `runCucumber`.
	 */
	runConfiguration: IRunConfiguration;
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
	const { cwd, env, logger } = makeEnvironment(environment);
	const configFile = options.file ?? locateFile(cwd);
	if (configFile) {
		logger.debug(`Configuration will be loaded from "${configFile}"`);
	} else if (configFile === false) {
		logger.debug('Skipping configuration file resolution');
	} else {
		logger.debug('No configuration file found');
	}
	const profileConfiguration = configFile ? await fromFile(logger, cwd, configFile, options.profiles) : {};

	// if a feature was passed in on command line it's added
	// to the provided configuration as paths. We need to clear
	// any paths from configuration so that only the feature passed
	// in is executed.
	const paths = (options.provided as Partial<IConfiguration>).paths;
	if (paths && paths?.length > 0) {
		profileConfiguration.paths = [];
	}

	const original = mergeConfigurations(
		DEFAULT_CONFIGURATION,
		profileConfiguration,
		parseConfiguration(logger, 'Provided', options.provided)
	) as ITsflowConfiguration;

	switch (original.transpiler) {
		case 'esvue':
			original.requireModule.push('@lynxwall/cucumber-tsflow/lib/esvue');
			break;
		case 'tsvue':
			original.requireModule.push('@lynxwall/cucumber-tsflow/lib/tsvue');
			break;
		case 'tsnode':
			original.requireModule.push('@lynxwall/cucumber-tsflow/lib/tsnode');
			break;
		default:
			// defaulting to esbuild
			original.requireModule.push('@lynxwall/cucumber-tsflow/lib/esnode');
			break;
	}
	// set the snippet syntax
	if (!original.formatOptions.snippetSyntax) {
		original.formatOptions.snippetSyntax = '@lynxwall/cucumber-tsflow/snippet';
	}
	// look for behave format
	for (let idx = 0; idx < original.format.length; idx++) {
		if (typeof original.format[idx] === 'string') {
			const formatItem = original.format[idx] as string;
			if (formatItem.startsWith('behave:')) {
				original.format[idx] = formatItem.replace('behave', '@lynxwall/cucumber-tsflow/behave');
			}
		} else if (original.format[idx].length > 0) {
			const formatItem = original.format[idx][0] as string;
			if (formatItem.startsWith('behave')) {
				const newVal = formatItem.replace('behave', '@lynxwall/cucumber-tsflow/behave');
				original.format[idx] = original.format[idx].length > 1 ? [newVal, original.format[idx][1]] : [newVal];
			}
		}
	}

	// look for junitbamboo format
	for (let idx = 0; idx < original.format.length; idx++) {
		if (typeof original.format[idx] === 'string') {
			const formatItem = original.format[idx] as string;
			if (formatItem.startsWith('junitbamboo:')) {
				original.format[idx] = formatItem.replace('junitbamboo', '@lynxwall/cucumber-tsflow/junitbamboo');
			}
		} else if (original.format[idx].length > 0) {
			const formatItem = original.format[idx][0] as string;
			if (formatItem.startsWith('junitbamboo')) {
				const newVal = formatItem.replace('junitbamboo', '@lynxwall/cucumber-tsflow/junitbamboo');
				original.format[idx] = original.format[idx].length > 1 ? [newVal, original.format[idx][1]] : [newVal];
			}
		}
	}

	// check to see if a debugFile was passed in
	if (hasStringValue(original.debugFile)) {
		// Initialize gherkin manager with path to feature files
		const gherkin = new GherkinManager();
		await gherkin.loadFeatures(original.paths);
		const features = gherkin.findFeaturesByStepFile(original.debugFile);
		if (features.length > 0) {
			original.paths = [];
			features.forEach(x => original.paths.push(x.featureFile));
		} else {
			// log a message if the feature path is not found
			logger.warn(chalk.yellow(`\nUnable to find feature for debugFile: ${original.debugFile}`));
			logger.warn(chalk.yellow('All tests will be executed\n'));
		}
	}

	// check to see if enable-vue-style was set
	// if not, default it to false
	if (original.enableVueStyle === null || original.enableVueStyle === undefined) {
		original.enableVueStyle = false;
	}
	// set our global parameter used by the Vue transpiler
	// to determine if Vue Style Blocks should be enabled
	global.enableVueStyle = original.enableVueStyle;

	validateConfiguration(original, logger);
	const runnable = await convertConfiguration(logger, original, env);
	return {
		useConfiguration: original,
		runConfiguration: runnable
	};
};
