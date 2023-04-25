import { ManagedScenarioContext } from '../cucumber/managed-scenario-context';
import { Options } from './configuration';

export type StepFromStepDefinitions = {
	stepMatcher: string | RegExp;
	stepFunction(stepArguments?: any): void | PromiseLike<any>;
};

export type ScenarioFromStepDefinitions = {
	title: string;
	steps: StepFromStepDefinitions[];
};

export type FeatureFromStepDefinitions = {
	title: string;
	scenarios: ScenarioFromStepDefinitions[];
};

export type ParsedStep = {
	keyword: string;
	stepText: string;
	stepArgument: string | {};
	lineNumber: number;
};

export type ParsedScenario = {
	title: string;
	steps: ParsedStep[];
	tags: string[];
	lineNumber: number;
	skippedViaTagFilter: boolean;
	scenarioContext: ManagedScenarioContext | undefined;
};

export type ParsedScenarioOutline = {
	title: string;
	tags: string[];
	exampleScenarios: ParsedScenario[];
	steps: ParsedStep[];
	lineNumber: number;
	skippedViaTagFilter: boolean;
	scenarioContext: ManagedScenarioContext | undefined;
};

export type ParsedFeature = {
	title: string;
	featureFile: string;
	scenarios: ParsedScenario[];
	scenarioOutlines: ParsedScenarioOutline[];
	options: Options;
	tags: string[];
};
