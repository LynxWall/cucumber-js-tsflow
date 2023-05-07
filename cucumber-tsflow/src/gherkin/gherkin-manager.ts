import { readFileSync } from 'fs';
import GherkinFeature from './gherkin-feature';
import { ParsedFeature } from './models';
import { hasStringValue } from '../utils/helpers';
import { hasMatchingStep, hasMatchingTags } from '../cucumber/utils';

class StepInfo {
	constructor(name: string) {
		this.name = name;
	}
	name: string;
	text: string = '';
	tags: string = '';
}

export default class GherkinManager {
	private features: Array<ParsedFeature> = [];
	private gherkinFeature = new GherkinFeature();

	public loadFeatures = async (paths: string[]): Promise<void> => {
		for (let idx = 0; idx < paths.length; idx++) {
			const features = await this.gherkinFeature.loadFeatures(paths[idx]);
			this.features = [...this.features, ...features];
		}
	};

	/**
	 * Attempts to find a feature based on the steps found in
	 * a steps test file
	 * @param filePath
	 * @returns
	 */
	public findFeaturesByStepFile = (filePath: string): Array<ParsedFeature> => {
		const featuresResult = new Array<ParsedFeature>();

		const fileSteps = this.parseSteps(filePath);
		for (let idx = 0; idx < this.features.length; idx++) {
			const feature = this.features[idx];
			for (let sIdx = 0; sIdx < feature.scenarios.length; sIdx++) {
				const scenario = feature.scenarios[sIdx];
				for (let stIdx = 0; stIdx < scenario.steps.length; stIdx++) {
					const step = scenario.steps[stIdx];
					if (['given', 'when', 'then', 'and'].find(x => x === step.keyword)) {
						const fileStep = fileSteps.find(s => hasMatchingStep(s.text, step.stepText));
						if (fileStep) {
							// if we have tags on the step binding check to see if it matches one in the
							// current scenario, which also includes tags associated with the feature
							if (hasStringValue(fileStep.tags)) {
								if (scenario.tags.length > 0 && hasMatchingTags(fileStep.tags, scenario.tags)) {
									featuresResult.push(feature);
								}
							} else {
								featuresResult.push(feature);
							}
						}
					}
					if (featuresResult.includes(feature)) break;
				}
				if (featuresResult.includes(feature)) break;
			}
			for (let oIdx = 0; oIdx < feature.scenarioOutlines.length; oIdx++) {
				const scenarioOutline = feature.scenarioOutlines[oIdx];
				if (scenarioOutline.exampleScenarios && (scenarioOutline.exampleScenarios?.length ?? 0 > 0)) {
					const outlineSteps = scenarioOutline.exampleScenarios[0].steps;
					for (let osIdx = 0; osIdx < outlineSteps.length; osIdx++) {
						const step = outlineSteps[osIdx];
						if (['given', 'when', 'then', 'and'].find(x => x === step.keyword)) {
							const fileStep = fileSteps.find(s => hasMatchingStep(s.text, step.stepText));
							if (fileStep) {
								// if we have tags on the step binding check to see if it matches one in the
								// current scenario, which also includes tags associated with the feature
								if (hasStringValue(fileStep.tags)) {
									if (scenarioOutline.tags.length > 0 && hasMatchingTags(fileStep.tags, scenarioOutline.tags)) {
										featuresResult.push(feature);
									}
								} else {
									featuresResult.push(feature);
								}
							}
						}
						if (featuresResult.includes(feature)) break;
					}
					if (featuresResult.includes(feature)) break;
				}
			}
		}
		return featuresResult;
	};

	generateKey = (name: string, tags: string[]): string => {
		return `${name}:${tags.map(tag => tag.toLowerCase()).join(',')}`;
	};

	/**
	 * extracts 'given', 'when', 'then' step text and tags from
	 * the file passed in.
	 * @param filePath
	 * @returns
	 */
	parseSteps = (filePath: string): StepInfo[] => {
		const stepNames = ['before', 'beforestep', 'given', 'when', 'then', 'afterstep', 'after'];
		const steps = new Array<StepInfo>();
		const stepText: string = readFileSync(filePath, 'utf8');
		// get all of the decorator strings
		const stepDecorators = stepText.match(/@\w*\(([^()]+)\)/g);
		stepDecorators?.forEach(decorator => {
			const stepName = stepNames.find(x => decorator.toLowerCase().indexOf(x) >= 0);
			if (stepName) {
				const stepInfo = new StepInfo(stepName);
				// extract strings from inside decorator parens,
				// can be wrapped in single or double quotes
				const stepParams = decorator.match(/["']\s*([^"']+?)\s*["']/g);
				if (stepParams && stepParams.length > 0) {
					// first param in hooks is the tags parameter
					if (this.isHook(stepName)) {
						stepInfo.tags = stepParams[0].substring(1, stepParams[0].length - 1);
					} else {
						// steps support four parameters with last three optional
						// first is the pattern and second is a tag, which are the
						// two peices of information we need to make a match
						stepInfo.text = stepParams[0].substring(1, stepParams[0].length - 1);
						if (stepParams.length > 1 && hasStringValue(stepParams[1])) {
							stepInfo.tags = stepParams[1].substring(1, stepParams[1].length - 1);
						}
					}
				}
				steps.push(stepInfo);
			}
		});

		return steps;
	};

	isHook = (stepName: string): boolean => {
		const hookNames = ['beforeall', 'before', 'beforestep', 'afterstep', 'after', 'afterall'];
		const match = hookNames.find(x => stepName.toLowerCase().indexOf(x) >= 0);
		return match != undefined;
	};
}
