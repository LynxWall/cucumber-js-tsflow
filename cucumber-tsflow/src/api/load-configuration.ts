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
	const { cwd, env, logger } = makeEnvironment(environment);
	const configFile = options.file ?? locateFile(cwd);
	let msg = '';
	if (configFile) {
		msg = `Loading configuration from "${configFile}".`;
	} else if (configFile === false) {
		msg = 'Skipping configuration file resolution';
	} else {
		msg = 'No configuration file found';
	}
	// log this to debug and console
	const consoleLogger = new Console(environment.stdout as any, environment.stderr);
	logger.debug(msg);
	consoleLogger.log(ansis.cyanBright(msg));

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

	// Get the experimental decorators setting
	if (original.experimentalDecorators === undefined) {
		original.experimentalDecorators = false;
	}
	const experimentalDecorators = original.experimentalDecorators;
	global.experimentalDecorators = experimentalDecorators;
	// todo: add the esm transpilers here
	if (original.transpiler) {
		switch (original.transpiler) {
			case 'esvue':
				original.requireModule.push('@lynxwall/cucumber-tsflow/lib/transpilers/esvue');
				break;
			case 'tsvue': {
				const module = experimentalDecorators ? 'tsvue-exp' : 'tsvue';
				original.requireModule.push(`@lynxwall/cucumber-tsflow/lib/transpilers/${module}`);
				break;
			}
			case 'tsnode': {
				const module = experimentalDecorators ? 'tsnode-exp' : 'tsnode';
				original.requireModule.push(`@lynxwall/cucumber-tsflow/lib/transpilers/${module}`);
				break;
			}
			case 'vueesm': {
				original.loader.push(`@lynxwall/cucumber-tsflow/lib/transpilers/esm/vue-loader`); // per cucumber docs, we want to add this to the loader for esm
				break;
			}
			default:
				// defaulting to esnode
				original.requireModule.push('@lynxwall/cucumber-tsflow/lib/transpilers/esnode');
				break;
		}
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
			logger.warn(ansis.yellow(`\nUnable to find feature for debugFile: ${original.debugFile}`));
			logger.warn(ansis.yellow('All tests will be executed\n'));
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
