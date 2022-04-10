import * as messages from '@cucumber/messages';
import { StepBinding } from '../types/step-binding';
import { ManagedScenarioContext } from './managed-scenario-context';
import { hasMatchingStep, hasMatchingTags } from './utils';
import { hasStringValue } from '../utils/helpers';

interface IScenario extends messages.Pickle {
	scenarioContext: ManagedScenarioContext | undefined;
}

class MessageCollector {
	private pickleMap: Record<string, IScenario> = {};
	private testCaseMap: Record<string, messages.TestCase> = {};
	private testCaseRunningMap: Record<string, messages.TestCaseStarted> = {};

	/**
	 * Gets the Pickle from hook parameters passed in from Cucumber
	 * to find a matching Pickle (scenario) and return the scenario Context
	 * @param hookParam
	 * @returns
	 */
	getHookScenarioContext(hookParam: any): ManagedScenarioContext | undefined {
		let scenarioContext: ManagedScenarioContext | undefined;

		if (hookParam) {
			const pickle = hookParam.pickle as IScenario;
			const scenario = this.pickleMap[pickle.id];
			if (scenario && scenario.scenarioContext) {
				scenarioContext = scenario.scenarioContext;
			}
		}
		return scenarioContext;
	}

	/**
	 * Uses StepPattern information to find a matching scenario
	 * and return the ScenarioContext
	 * @param stepBinding
	 * @returns
	 */
	getStepScenarioContext(stepBinding: StepBinding): ManagedScenarioContext | undefined {
		let scenarioContext: ManagedScenarioContext | undefined;
		for (const [, scenario] of Object.entries(this.pickleMap)) {
			for (const step of scenario.steps) {
				if (hasMatchingStep(stepBinding.stepPattern.toString(), step.text)) {
					// if we have tags on the step binding check to see if it matches one in the
					// current scenario, which also includes tags associated with the feature
					if (stepBinding.tags && this.stepHasTags(stepBinding.tags)) {
						if (
							scenario.tags.length > 0 &&
							hasMatchingTags(
								stepBinding.tags,
								scenario.tags.map(x => x.name)
							)
						) {
							scenarioContext = scenario.scenarioContext;
						}
					} else {
						scenarioContext = scenario.scenarioContext;
					}
				}
				if (scenarioContext) break;
			}
			if (scenarioContext) break;
		}
		return scenarioContext;
	}

	/**
	 * Passed into runCucumber as a callback for all messages.
	 * Capture the ones we care about
	 * @param envelope
	 */
	parseEnvelope(envelope: messages.Envelope): void {
		if (envelope.pickle && envelope.pickle.id) {
			this.pickleMap[envelope.pickle.id] = envelope.pickle as IScenario;
		} else if (envelope.testCase && envelope.testCase.id) {
			this.testCaseMap[envelope.testCase.id] = envelope.testCase;
		} else if (envelope.testCaseStarted) {
			this.startTestCase(envelope.testCaseStarted);
		} else if (envelope.testCaseFinished) {
			this.endTestCase(envelope.testCaseFinished);
		}
	}

	/**
	 * Called when a test case (scenario) starts. Intercepting
	 * this message to initialize a new ScenarioContext
	 * @param testCaseStarted
	 */
	private startTestCase(testCaseStarted: messages.TestCaseStarted): void {
		this.testCaseRunningMap[testCaseStarted.id] = testCaseStarted;
		const scenario = this.getScenarioForTest(testCaseStarted.testCaseId);
		if (scenario) {
			const tags = scenario.tags.map(t => t.name);
			scenario.scenarioContext = new ManagedScenarioContext(scenario.name, tags);
		}
	}

	/**
	 * Called when a test case (scenario) ends. Intercepting
	 * this message to dispose and clear the ScenarioContext
	 * @param testCaseFinished
	 */
	private endTestCase(testCaseFinished: messages.TestCaseFinished): void {
		const testCase = this.testCaseRunningMap[testCaseFinished.testCaseStartedId];
		if (testCase) {
			const scenario = this.getScenarioForTest(testCase.testCaseId);
			if (scenario && scenario.scenarioContext) {
				scenario.scenarioContext.dispose();
				scenario.scenarioContext = undefined;
			}
		}
	}

	/**
	 * Uses the testCaleId passed in to find the associated Pickle (scenario)
	 * @param testCaseId
	 * @returns
	 */
	private getScenarioForTest(testCaseId: string): IScenario | undefined {
		const testCase = this.testCaseMap[testCaseId];
		if (testCase) {
			return this.pickleMap[testCase.pickleId];
		}
		return undefined;
	}

	/**
	 * StepBinding tags are initialized with an astrick when empty.
	 * Need to make sure tags has a value and not an astrick
	 * @param tags
	 * @returns
	 */
	private stepHasTags(tags: string): boolean {
		return hasStringValue(tags) && !tags?.includes('*');
	}
}

// this needs to be initialized once since it's used
// throughout the test run in different modules
const messageCollector: MessageCollector = new MessageCollector();

export default messageCollector;
