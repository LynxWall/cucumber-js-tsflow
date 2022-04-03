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
import GherkinFeature from '../gherkin/gherkin-feature';
import { readFileSync } from 'fs';
import chalk from 'chalk';

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

class StepInfo {
	text: string = '';
	tag: string = '';
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

	switch (original.environment) {
		case 'vuedom':
			original.requireModule.push('@lynxwall/cucumber-tsflow/lib/tsflow-vuedom');
			break;
		default:
			original.requireModule.push('@lynxwall/cucumber-tsflow/lib/tsflow-node');
			break;
	}
	// set the snippet syntax
	if (!original.formatOptions.snippetSyntax) {
		original.formatOptions.snippetSyntax = '@lynxwall/cucumber-tsflow/lib/tsflow-snippet.js';
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
	if (original.debugFile?.length > 0) {
		const fileSteps = parseSteps(original.debugFile);
		const gherkinFeature = new GherkinFeature();
		let featurePath: string | undefined = '';
		for (let path of original.paths) {
			let found: boolean = false;
			const features = gherkinFeature.loadFeatures(path);
			const feature = features.find(feature => {
				feature.scenarios.find(scenario => {
					scenario.steps.find(step => {
						if (['given', 'when', 'then'].find(x => x === step.keyword)) {
							const fileStep = fileSteps.find(s => s.text == step.stepText);
							if (fileStep) {
								// if we have a tag check to see if it matches one in the current scenario
								// or in the current feature
								if (fileStep.tag.length > 0) {
									// check to see if it's associated with the scenario
									if (scenario.tags.length > 0) {
										const tag = scenario.tags.find(t => fileStep.tag.indexOf(t) >= 0);
										found = tag && tag.length > 0 ? true : false;
									}
									// if not a scenario tag check to see if we have one associated with the feature
									else if (!found && feature.tags.length > 0) {
										const tag = feature.tags.find(t => fileStep.tag.indexOf(t) >= 0);
										found = tag && tag.length > 0 ? true : false;
									}
								} else {
									found = true;
								}
							}
						}
						return found;
					});
					return found;
				});
				return found;
			});
			if (feature) {
				featurePath = feature.featureFile;
				break;
			}
		}
		if (featurePath && featurePath.length > 0) {
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
/**
 * extracts 'given', 'when', 'then' step text and tags from
 * the file passed in.
 * @param filePath
 * @returns
 */
const parseSteps = (filePath: string): StepInfo[] => {
	const steps = new Array<StepInfo>();
	const stepText: string = readFileSync(filePath, 'utf8');
	// get all of the decorator strings
	const stepsText = stepText.match(/@\w*\(([^()]+)\)/g);
	stepsText?.forEach(x => {
		// extract strings from inside decorator parens
		// can be wrapped in single or double quotes
		const txt = x.match(/["']\s*([^"']+?)\s*["']/g);
		if (txt && txt.length > 0) {
			const stepInfo = new StepInfo();
			// steps support four parameters with last three optional
			// first is the pattern and second is a tag, which are the
			// two peices of information we need to make a match
			stepInfo.text = txt[0].substring(1, txt[0].length - 1);
			if (txt.length > 1 && isValidString(txt[1])) {
				stepInfo.tag = txt[1].substring(1, txt[1].length - 1);
			}
			steps.push(stepInfo);
		}
	});

	return steps;
};

const isValidString = (text: any) => {
	const isString = typeof text === 'string' || text instanceof String;
	if (isString && text.length > 0) {
		return true;
	}
	return false;
};
