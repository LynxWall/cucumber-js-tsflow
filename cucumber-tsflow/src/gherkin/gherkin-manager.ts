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

	constructor(paths: string[]) {
		for (const path of paths) {
			const features = this.gherkinFeature.loadFeatures(path);
			this.features = [...this.features, ...features];
		}
	}

	/**
	 * Attempts to find a feature based on the steps found in
	 * a steps test file
	 * @param filePath
	 * @returns
	 */
	public findFeatureByStepFile = (filePath: string): ParsedFeature | undefined => {
		let featureResult: ParsedFeature | undefined = undefined;

		const fileSteps = this.parseSteps(filePath);
		for (const feature of this.features) {
			for (const scenario of feature.scenarios) {
				for (const step of scenario.steps) {
					if (['given', 'when', 'then'].find(x => x === step.keyword)) {
						const fileStep = fileSteps.find(s => hasMatchingStep(s.text, step.stepText));
						if (fileStep) {
							// if we have tags on the step binding check to see if it matches one in the
							// current scenario, which also includes tags associated with the feature
							if (hasStringValue(fileStep.tags)) {
								if (scenario.tags.length > 0 && hasMatchingTags(fileStep.tags, scenario.tags)) {
									featureResult = feature;
								}
							} else {
								featureResult = feature;
							}
						}
					}
					if (featureResult) break;
				}
				if (featureResult) break;
			}
			if (featureResult) break;
		}
		return featureResult;
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
