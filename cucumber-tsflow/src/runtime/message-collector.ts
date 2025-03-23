import * as messages from '@cucumber/messages';
import { doesHaveValue, doesNotHaveValue } from '@cucumber/cucumber/lib/value_checker';
import { StepBinding } from '../bindings/step-binding';
import { ManagedScenarioContext } from './managed-scenario-context';
import { hasMatchingStep, hasMatchingTags } from './utils';
import { hasStringValue } from '../utils/helpers';
import { TestStepResultStatus } from '@cucumber/messages';
import EventEmitter from 'events';
import { EndTestCaseInfo } from './test-case-info';
import { IMessageData } from './parallel/types';

interface ITestCaseAttemptData {
	attempt: number;
	willBeRetried: boolean;
	testCaseId: string;
	stepAttachments: Record<string, messages.Attachment[]>;
	stepResults: Record<string, messages.TestStepResult>;
	worstTestStepResult: messages.TestStepResult;
}

export interface ITestCaseAttempt {
	attempt: number;
	willBeRetried: boolean;
	gherkinDocument: messages.GherkinDocument;
	pickle: messages.Pickle;
	stepAttachments: Record<string, messages.Attachment[]>;
	stepResults: Record<string, messages.TestStepResult>;
	testCase: messages.TestCase;
	worstTestStepResult: messages.TestStepResult;
}

interface IScenario extends messages.Pickle {
	scenarioContext: ManagedScenarioContext | undefined;
}

/**
 * Custom implementation of the EventDataCollector from cucumber.js
 *
 * This implements all of the functions from the original EventDataCollector along
 * with new functions to support binding to tsFlow tests.
 *
 * By extending the original version we're also reducing the amount of data stored
 * during test runs because the original MessageCollector was capturing the same
 * pickle and testCase data that the EventDataCollector does.
 */
export default class MessageCollector {
	private gherkinDocumentMap: Record<string, messages.GherkinDocument> = {};
	private pickleMap: Record<string, messages.Pickle> = {};
	private testCaseMap: Record<string, messages.TestCase> = {};
	private testCaseAttemptDataMap: Record<string, ITestCaseAttemptData> = {};
	private undefinedParameterTypes: messages.UndefinedParameterType[] = [];
	private testCaseRunningMap: Record<string, messages.TestCaseStarted> = {};

	constructor(eventBroadcaster: EventEmitter) {
		eventBroadcaster.on('envelope', this.parseEnvelope.bind(this));
	}

	/**
	 * Reset this message collector for a new parallel test run.
	 * @param messageData Gerkin information from initial load
	 */
	reset(messageData: IMessageData): void {
		this.gherkinDocumentMap = messageData.gherkinDocumentMap;
		this.pickleMap = messageData.pickleMap;
		this.testCaseMap = messageData.testCaseMap;
		this.testCaseAttemptDataMap = {};
		this.undefinedParameterTypes = [];
		this.testCaseRunningMap = {};
	}

	/**
	 * Get Gerkin message data for parallel runs
	 * @returns Gerkin informaion loaded during startup
	 */
	getMessageData(): IMessageData {
		const data = {} as IMessageData;
		data.gherkinDocumentMap = this.gherkinDocumentMap;
		data.pickleMap = this.pickleMap;
		data.testCaseMap = this.testCaseMap;

		return data;
	}

	/**
	 * Check for failures in a test run
	 * @returns true if there are failures in the last test case attempt
	 */
	hasFailures(): boolean {
		for (const caseKey in this.testCaseAttemptDataMap) {
			const stepResults = this.testCaseAttemptDataMap[caseKey].stepResults;
			for (const key in stepResults) {
				if (stepResults[key].status === TestStepResultStatus.FAILED) {
					return true;
				}
			}
		}
		return false;
	}

	getGherkinDocument(uri: string): messages.GherkinDocument {
		return this.gherkinDocumentMap[uri];
	}

	getPickle(pickleId: string): messages.Pickle {
		return this.pickleMap[pickleId];
	}

	getTestCaseAttempts(): ITestCaseAttempt[] {
		return Object.keys(this.testCaseAttemptDataMap).map(testCaseStartedId => {
			return this.getTestCaseAttempt(testCaseStartedId);
		});
	}

	getTestCaseAttempt(testCaseStartedId: string): ITestCaseAttempt {
		const testCaseAttemptData = this.testCaseAttemptDataMap[testCaseStartedId];
		const testCase = this.testCaseMap[testCaseAttemptData.testCaseId];
		const pickle = this.pickleMap[testCase.pickleId];
		return {
			gherkinDocument: this.gherkinDocumentMap[pickle.uri],
			pickle,
			testCase,
			attempt: testCaseAttemptData.attempt,
			willBeRetried: testCaseAttemptData.willBeRetried,
			stepAttachments: testCaseAttemptData.stepAttachments,
			stepResults: testCaseAttemptData.stepResults,
			worstTestStepResult: testCaseAttemptData.worstTestStepResult
		};
	}

	parseEnvelope(envelope: messages.Envelope): void {
		if (doesHaveValue(envelope.gherkinDocument)) {
			this.gherkinDocumentMap[envelope.gherkinDocument.uri] = envelope.gherkinDocument;
		} else if (doesHaveValue(envelope.pickle)) {
			this.pickleMap[envelope.pickle.id] = envelope.pickle;
		} else if (doesHaveValue(envelope.undefinedParameterType)) {
			this.undefinedParameterTypes.push(envelope.undefinedParameterType);
		} else if (doesHaveValue(envelope.testCase)) {
			this.testCaseMap[envelope.testCase.id] = envelope.testCase;
		} else if (doesHaveValue(envelope.testCaseStarted)) {
			this.initTestCaseAttempt(envelope.testCaseStarted);
			this.startTestCase(envelope.testCaseStarted);
		} else if (doesHaveValue(envelope.attachment)) {
			this.storeAttachment(envelope.attachment);
		} else if (doesHaveValue(envelope.testStepFinished)) {
			this.storeTestStepResult(envelope.testStepFinished);
		} else if (doesHaveValue(envelope.testCaseFinished)) {
			this.storeTestCaseResult(envelope.testCaseFinished);
		}
	}

	private initTestCaseAttempt(testCaseStarted: messages.TestCaseStarted): void {
		this.testCaseAttemptDataMap[testCaseStarted.id] = {
			attempt: testCaseStarted.attempt,
			willBeRetried: false,
			testCaseId: testCaseStarted.testCaseId,
			stepAttachments: {},
			stepResults: {},
			worstTestStepResult: {
				duration: { seconds: 0, nanos: 0 },
				status: messages.TestStepResultStatus.UNKNOWN
			}
		};
	}

	storeAttachment(attachment: messages.Attachment): void {
		const { testCaseStartedId, testStepId } = attachment;
		if (testCaseStartedId && testStepId) {
			const { stepAttachments } = this.testCaseAttemptDataMap[testCaseStartedId];
			if (doesNotHaveValue(stepAttachments[testStepId])) {
				stepAttachments[testStepId] = [];
			}
			stepAttachments[testStepId].push(attachment);
		}
	}

	storeTestStepResult({ testCaseStartedId, testStepId, testStepResult }: messages.TestStepFinished): void {
		this.testCaseAttemptDataMap[testCaseStartedId].stepResults[testStepId] = testStepResult;
	}

	storeTestCaseResult({ testCaseStartedId, willBeRetried }: messages.TestCaseFinished): void {
		const stepResults = Object.values(this.testCaseAttemptDataMap[testCaseStartedId].stepResults);
		this.testCaseAttemptDataMap[testCaseStartedId].worstTestStepResult = messages.getWorstTestStepResult(stepResults);
		this.testCaseAttemptDataMap[testCaseStartedId].willBeRetried = willBeRetried;
	}

	/**
	 * Gets the Pickle from hook parameters passed in from Cucumber
	 * to find a matching Pickle (scenario) and return the scenario Context
	 * @param hookParam
	 * @returns
	 */
	getHookScenarioContext(hookParam: any): ManagedScenarioContext | undefined {
		let scenarioContext: ManagedScenarioContext | undefined;

		if (hookParam) {
			const pickle = hookParam.pickle;
			const scenario = this.pickleMap[pickle.id] as IScenario;
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
		for (const [, pickle] of Object.entries(this.pickleMap)) {
			const scenario = pickle as IScenario;
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
	public async endTestCase(endTestCase: EndTestCaseInfo): Promise<void> {
		const testCase = this.testCaseRunningMap[endTestCase.testCaseStartedId];
		if (testCase) {
			const scenario = this.getScenarioForTest(testCase.testCaseId);
			if (scenario && scenario.scenarioContext) {
				await scenario.scenarioContext.dispose(endTestCase);
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
			return this.pickleMap[testCase.pickleId] as IScenario;
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
