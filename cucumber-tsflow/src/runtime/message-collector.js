"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const messages = __importStar(require("@cucumber/messages"));
const value_checker_1 = require("@cucumber/cucumber/lib/value_checker");
const managed_scenario_context_1 = require("./managed-scenario-context");
const utils_1 = require("./utils");
const helpers_1 = require("../utils/helpers");
const messages_1 = require("@cucumber/messages");
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
class MessageCollector {
    gherkinDocumentMap = {};
    pickleMap = {};
    testCaseMap = {};
    testCaseAttemptDataMap = {};
    undefinedParameterTypes = [];
    testCaseRunningMap = {};
    constructor(eventBroadcaster) {
        eventBroadcaster.on('envelope', this.parseEnvelope.bind(this));
    }
    /**
     * Reset this message collector for a new parallel test run.
     * @param messageData Gerkin information from initial load
     */
    reset(messageData) {
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
    getMessageData() {
        const data = {};
        data.gherkinDocumentMap = this.gherkinDocumentMap;
        data.pickleMap = this.pickleMap;
        data.testCaseMap = this.testCaseMap;
        return data;
    }
    /**
     * Check for failures in a test run
     * @returns true if there are failures in the last test case attempt
     */
    hasFailures() {
        for (const caseKey in this.testCaseAttemptDataMap) {
            const stepResults = this.testCaseAttemptDataMap[caseKey].stepResults;
            for (const key in stepResults) {
                if (stepResults[key].status === messages_1.TestStepResultStatus.FAILED) {
                    return true;
                }
            }
        }
        return false;
    }
    getGherkinDocument(uri) {
        return this.gherkinDocumentMap[uri];
    }
    getPickle(pickleId) {
        return this.pickleMap[pickleId];
    }
    getTestCaseAttempts() {
        return Object.keys(this.testCaseAttemptDataMap).map(testCaseStartedId => {
            return this.getTestCaseAttempt(testCaseStartedId);
        });
    }
    getTestCaseAttempt(testCaseStartedId) {
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
    parseEnvelope(envelope) {
        if ((0, value_checker_1.doesHaveValue)(envelope.gherkinDocument)) {
            this.gherkinDocumentMap[envelope.gherkinDocument.uri] = envelope.gherkinDocument;
        }
        else if ((0, value_checker_1.doesHaveValue)(envelope.pickle)) {
            this.pickleMap[envelope.pickle.id] = envelope.pickle;
        }
        else if ((0, value_checker_1.doesHaveValue)(envelope.undefinedParameterType)) {
            this.undefinedParameterTypes.push(envelope.undefinedParameterType);
        }
        else if ((0, value_checker_1.doesHaveValue)(envelope.testCase)) {
            this.testCaseMap[envelope.testCase.id] = envelope.testCase;
        }
        else if ((0, value_checker_1.doesHaveValue)(envelope.testCaseStarted)) {
            this.initTestCaseAttempt(envelope.testCaseStarted);
            this.startTestCase(envelope.testCaseStarted);
        }
        else if ((0, value_checker_1.doesHaveValue)(envelope.attachment)) {
            this.storeAttachment(envelope.attachment);
        }
        else if ((0, value_checker_1.doesHaveValue)(envelope.testStepFinished)) {
            this.storeTestStepResult(envelope.testStepFinished);
        }
        else if ((0, value_checker_1.doesHaveValue)(envelope.testCaseFinished)) {
            this.storeTestCaseResult(envelope.testCaseFinished);
        }
    }
    initTestCaseAttempt(testCaseStarted) {
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
    storeAttachment(attachment) {
        const { testCaseStartedId, testStepId } = attachment;
        if (testCaseStartedId && testStepId) {
            const { stepAttachments } = this.testCaseAttemptDataMap[testCaseStartedId];
            if ((0, value_checker_1.doesNotHaveValue)(stepAttachments[testStepId])) {
                stepAttachments[testStepId] = [];
            }
            stepAttachments[testStepId].push(attachment);
        }
    }
    storeTestStepResult({ testCaseStartedId, testStepId, testStepResult }) {
        this.testCaseAttemptDataMap[testCaseStartedId].stepResults[testStepId] = testStepResult;
    }
    storeTestCaseResult({ testCaseStartedId, willBeRetried }) {
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
    getHookScenarioContext(hookParam) {
        let scenarioContext;
        if (hookParam) {
            const pickle = hookParam.pickle;
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
    getStepScenarioContext(stepBinding) {
        let scenarioContext;
        for (const [, pickle] of Object.entries(this.pickleMap)) {
            const scenario = pickle;
            for (const step of scenario.steps) {
                if ((0, utils_1.hasMatchingStep)(stepBinding.stepPattern.toString(), step.text)) {
                    // if we have tags on the step binding check to see if it matches one in the
                    // current scenario, which also includes tags associated with the feature
                    if (stepBinding.tags && this.stepHasTags(stepBinding.tags)) {
                        if (scenario.tags.length > 0 &&
                            (0, utils_1.hasMatchingTags)(stepBinding.tags, scenario.tags.map(x => x.name))) {
                            scenarioContext = scenario.scenarioContext;
                        }
                    }
                    else {
                        scenarioContext = scenario.scenarioContext;
                    }
                }
                if (scenarioContext)
                    break;
            }
            if (scenarioContext)
                break;
        }
        return scenarioContext;
    }
    /**
     * Called when a test case (scenario) starts. Intercepting
     * this message to initialize a new ScenarioContext
     * @param testCaseStarted
     */
    startTestCase(testCaseStarted) {
        this.testCaseRunningMap[testCaseStarted.id] = testCaseStarted;
        const scenario = this.getScenarioForTest(testCaseStarted.testCaseId);
        if (scenario) {
            const tags = scenario.tags.map(t => t.name);
            scenario.scenarioContext = new managed_scenario_context_1.ManagedScenarioContext(scenario.name, tags);
        }
    }
    /**
     * Called when a test case (scenario) ends. Intercepting
     * this message to dispose and clear the ScenarioContext
     * @param testCaseFinished
     */
    async endTestCase(endTestCase) {
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
    getScenarioForTest(testCaseId) {
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
    stepHasTags(tags) {
        return (0, helpers_1.hasStringValue)(tags) && !tags?.includes('*');
    }
}
exports.default = MessageCollector;
//# sourceMappingURL=message-collector.js.map