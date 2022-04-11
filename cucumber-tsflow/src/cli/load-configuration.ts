import { Console } from 'console';
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
	const { cwd, env } = mergeEnvironment(environment);
	const configFile = options.file ?? locateFile(cwd);
	const profileConfiguration = configFile ? await fromFile(cwd, configFile, options.profiles) : {};
	const logger = new Console(environment.stdout as any, environment.stderr);

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
	const behaveIdx = original.format.findIndex(e => e.startsWith('behave:'));
	if (behaveIdx >= 0) {
		original.format[behaveIdx] = original.format[behaveIdx].replace(
			'behave',
			'@lynxwall/cucumber-tsflow/lib/behave.js'
		);
	}

	// check to see if a debugFile was passed in
	if (hasStringValue(original.debugFile)) {
		let featurePath: string | undefined = '';

		// Initialize gherkin manager with path to feature files
		const gherkin = new GherkinManager(original.paths);
		const featureInfo = gherkin.findFeatureByStepFile(original.debugFile);
		if (featureInfo) {
			featurePath = featureInfo.featureFile;
		}
		if (hasStringValue(featurePath)) {
			original.paths = [];
			original.paths.push(featurePath);
		} else {
			// log a message if the feature path is not found
			logger.warn(chalk.yellow(`\nUnable to find feature for debugFile: ${original.debugFile}`));
			logger.warn(chalk.yellow('All tests will be executed\n'));
		}
	}

	validateConfiguration(original);
	const runnable = await convertConfiguration(original, env);
	return {
		useConfiguration: original,
		runConfiguration: runnable
	};
};
