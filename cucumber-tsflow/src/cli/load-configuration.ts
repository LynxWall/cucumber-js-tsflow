import { IRunEnvironment, ILoadConfigurationOptions, IRunConfiguration } from '@cucumber/cucumber/lib/api/types';
import { locateFile } from '@cucumber/cucumber/lib/configuration/locate_file';
import {
	DEFAULT_CONFIGURATION,
	fromFile,
	IConfiguration,
	mergeConfigurations
} from '@cucumber/cucumber/lib/configuration/index';
import { validateConfiguration } from '@cucumber/cucumber/lib/configuration/validate_configuration';
import { convertConfiguration } from '@cucumber/cucumber/lib/api/convert_configuration';
import { mergeEnvironment } from '@cucumber/cucumber/lib/api/environment';
import { ITsflowConfiguration } from './argv-parser';
import chalk from 'chalk';
import { hasStringValue } from '../utils/helpers';
import GherkinManager from '../gherkin/gherkin-manager';
import { ILogger } from '@cucumber/cucumber/lib/logger';
import { ConsoleLogger } from '@cucumber/cucumber/lib/api/console_logger';
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
	const { cwd, stderr, env, debug } = mergeEnvironment(environment);
	const logger: ILogger = new ConsoleLogger(stderr, debug);

	const configFile = options.file ?? locateFile(cwd);
	if (configFile) {
		logger.debug(`Configuration will be loaded from "${configFile}"`);
	} else {
		logger.debug('No configuration file found');
	}
	const profileConfiguration = configFile ? await fromFile(logger, cwd, configFile, options.profiles) : {};

	// if a feature was passed in on command line it's added
	// to the provided configuration as paths. We need to clear
	// any paths from configuration so that only the feature passed
	// in is executed.
	if (options.provided?.paths && options.provided.paths?.length > 0) {
		profileConfiguration.paths = [];
	}

	const original = mergeConfigurations(
		DEFAULT_CONFIGURATION,
		profileConfiguration,
		options.provided as Partial<IConfiguration>
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
		original.formatOptions.snippetSyntax = '@lynxwall/cucumber-tsflow/lib/snippet.js';
	}
	// look for behave format
	for (let idx = 0; idx < original.format.length; idx++) {
		if (typeof original.format[idx] === 'string') {
			const formatItem = original.format[idx] as string;
			if (formatItem.startsWith('behave:')) {
				original.format[idx] = formatItem.replace('behave', '@lynxwall/cucumber-tsflow/lib/behave.js');
			}
		} else if (original.format[idx].length > 0) {
			const formatItem = original.format[idx][0] as string;
			if (formatItem.startsWith('behave')) {
				const newVal = formatItem.replace('behave', '@lynxwall/cucumber-tsflow/lib/behave.js');
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

	validateConfiguration(original, logger);
	const runnable = await convertConfiguration(logger, original, env);
	return {
		useConfiguration: original,
		runConfiguration: runnable
	};
};
