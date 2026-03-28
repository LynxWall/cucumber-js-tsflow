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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const helpers_1 = require("@cucumber/cucumber/lib/runtime/helpers");
const index_1 = __importDefault(require("@cucumber/cucumber/lib/runtime/attachment_manager/index"));
const step_runner_1 = __importDefault(require("@cucumber/cucumber/lib/runtime/step_runner"));
const messages = __importStar(require("@cucumber/messages"));
const messages_1 = require("@cucumber/messages");
const value_checker_1 = require("@cucumber/cucumber/lib/value_checker");
const binding_registry_1 = require("../bindings/binding-registry");
const console_1 = require("console");
const stopwatch_1 = require("@cucumber/cucumber/lib/runtime/stopwatch");
class TestCaseRunner {
    workerId;
    attachmentManager;
    currentTestCaseStartedId;
    currentTestStepId;
    eventBroadcaster;
    gherkinDocument;
    newId;
    pickle;
    testCase;
    maxAttempts;
    skip;
    filterStackTraces;
    supportCodeLibrary;
    testStepResults;
    world;
    worldParameters;
    bindingRegistry;
    constructor({ workerId, eventBroadcaster, gherkinDocument, newId, pickle, testCase, retries = 0, skip, filterStackTraces, supportCodeLibrary, worldParameters }) {
        this.workerId = workerId;
        this.attachmentManager = new index_1.default(({ data, media, fileName }) => {
            if ((0, value_checker_1.doesNotHaveValue)(this.currentTestStepId)) {
                throw new Error('Cannot attach when a step/hook is not running. Ensure your step/hook waits for the attach to finish.');
            }
            const attachment = {
                attachment: {
                    body: data,
                    contentEncoding: media.encoding,
                    mediaType: media.contentType,
                    fileName,
                    testCaseStartedId: this.currentTestCaseStartedId,
                    testStepId: this.currentTestStepId
                }
            };
            this.eventBroadcaster.emit('envelope', attachment);
        });
        this.eventBroadcaster = eventBroadcaster;
        this.gherkinDocument = gherkinDocument;
        this.maxAttempts = 1 + (skip ? 0 : retries);
        this.newId = newId;
        this.pickle = pickle;
        this.testCase = testCase;
        this.skip = skip;
        this.filterStackTraces = filterStackTraces;
        this.supportCodeLibrary = supportCodeLibrary;
        this.worldParameters = worldParameters;
        this.resetTestProgressData();
        this.bindingRegistry = binding_registry_1.BindingRegistry.instance;
    }
    resetTestProgressData() {
        this.world = new this.supportCodeLibrary.World({
            attach: this.attachmentManager.create.bind(this.attachmentManager),
            log: this.attachmentManager.log.bind(this.attachmentManager),
            link: this.attachmentManager.link.bind(this.attachmentManager),
            parameters: structuredClone(this.worldParameters)
        });
        this.testStepResults = [];
    }
    getBeforeStepHookDefinitions() {
        return this.supportCodeLibrary.beforeTestStepHookDefinitions.filter(hookDefinition => hookDefinition.appliesToTestCase(this.pickle));
    }
    getAfterStepHookDefinitions() {
        return this.supportCodeLibrary.afterTestStepHookDefinitions
            .slice(0)
            .reverse()
            .filter(hookDefinition => hookDefinition.appliesToTestCase(this.pickle));
    }
    getWorstStepResult() {
        if (!this.testStepResults || this.testStepResults.length === 0) {
            return {
                status: this.skip ? messages.TestStepResultStatus.SKIPPED : messages.TestStepResultStatus.PASSED,
                duration: messages.TimeConversion.millisecondsToDuration(0)
            };
        }
        return (0, messages_1.getWorstTestStepResult)(this.testStepResults);
    }
    async invokeStep(step, stepDefinition, hookParameter) {
        return await step_runner_1.default.run({
            defaultTimeout: this.supportCodeLibrary.defaultTimeout,
            filterStackTraces: this.filterStackTraces,
            hookParameter,
            step,
            stepDefinition,
            world: this.world
        });
    }
    isSkippingSteps() {
        return this.getWorstStepResult().status !== messages.TestStepResultStatus.PASSED;
    }
    shouldSkipHook(isBeforeHook) {
        return this.skip || (this.isSkippingSteps() && isBeforeHook);
    }
    async aroundTestStep(testStepId, runStepFn) {
        const testStepStarted = {
            testStepStarted: {
                testCaseStartedId: this.currentTestCaseStartedId,
                testStepId,
                timestamp: (0, stopwatch_1.timestamp)()
            }
        };
        this.eventBroadcaster.emit('envelope', testStepStarted);
        this.currentTestStepId = testStepId;
        const testStepResult = await runStepFn();
        this.currentTestStepId = null;
        this.testStepResults?.push(testStepResult);
        const testStepFinished = {
            testStepFinished: {
                testCaseStartedId: this.currentTestCaseStartedId,
                testStepId,
                testStepResult,
                timestamp: (0, stopwatch_1.timestamp)()
            }
        };
        this.eventBroadcaster.emit('envelope', testStepFinished);
    }
    async run() {
        for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
            const moreAttemptsRemaining = attempt + 1 < this.maxAttempts;
            const willBeRetried = await this.runAttempt(attempt, moreAttemptsRemaining);
            if (!willBeRetried) {
                break;
            }
            this.resetTestProgressData();
        }
        return this.getWorstStepResult().status;
    }
    async runAttempt(attempt, moreAttemptsRemaining) {
        this.currentTestCaseStartedId = this.newId();
        const testCaseStarted = {
            testCaseStarted: {
                attempt,
                testCaseId: this.testCase.id,
                id: this.currentTestCaseStartedId,
                timestamp: (0, stopwatch_1.timestamp)()
            }
        };
        if (this.workerId) {
            testCaseStarted.testCaseStarted.workerId = this.workerId;
        }
        this.eventBroadcaster.emit('envelope', testCaseStarted);
        // used to determine whether a hook is a Before or After
        let didWeRunStepsYet = false;
        for (const testStep of this.testCase.testSteps) {
            await this.aroundTestStep(testStep.id, async () => {
                if ((0, value_checker_1.doesHaveValue)(testStep.hookId)) {
                    const hookParameter = {
                        gherkinDocument: this.gherkinDocument,
                        pickle: this.pickle,
                        testCaseStartedId: this.currentTestCaseStartedId
                    };
                    if (didWeRunStepsYet) {
                        hookParameter.result = this.getWorstStepResult();
                        hookParameter.willBeRetried =
                            this.getWorstStepResult().status === messages.TestStepResultStatus.FAILED && moreAttemptsRemaining;
                    }
                    return await this.runHook(findHookDefinition(testStep.hookId, this.supportCodeLibrary), hookParameter, !didWeRunStepsYet);
                }
                else {
                    const pickleStep = this.pickle.steps.find(pickleStep => pickleStep.id === testStep.pickleStepId);
                    const testStepResult = await this.runStep(pickleStep, testStep);
                    didWeRunStepsYet = true;
                    return testStepResult;
                }
            });
        }
        const worseResult = this.getWorstStepResult();
        const willBeRetried = worseResult.status === messages.TestStepResultStatus.FAILED && moreAttemptsRemaining;
        const endTestCaseParameter = {
            gherkinDocument: this.gherkinDocument,
            pickle: this.pickle,
            testCaseStartedId: this.currentTestCaseStartedId,
            result: worseResult,
            willBeRetried: willBeRetried
        };
        // End test case will call dispose on all context types
        // passed into a binding and then end the context.
        await global.messageCollector.endTestCase(endTestCaseParameter);
        const testCaseFinished = {
            testCaseFinished: {
                testCaseStartedId: this.currentTestCaseStartedId,
                timestamp: (0, stopwatch_1.timestamp)(),
                willBeRetried
            }
        };
        this.eventBroadcaster.emit('envelope', testCaseFinished);
        return willBeRetried;
    }
    async runHook(hookDefinition, hookParameter, isBeforeHook) {
        if (this.shouldSkipHook(isBeforeHook)) {
            return {
                status: messages.TestStepResultStatus.SKIPPED,
                duration: messages.TimeConversion.millisecondsToDuration(0)
            };
        }
        // Get the step binding and scenario context so that we can
        // initialize any context objects before hooks are executed
        const stepBinding = this.bindingRegistry.getStepBindingByCucumberKey(hookDefinition.options.cucumberKey);
        if (!stepBinding)
            throw (0, console_1.error)('===268 test-case-runner.ts Unable to find StepBinding!');
        const scenarioContext = global.messageCollector.getHookScenarioContext(hookParameter);
        if (!scenarioContext)
            throw (0, console_1.error)('Unable to find the ManagedScenarioContext!');
        await this.initializeContext(stepBinding, scenarioContext);
        const { result } = await this.invokeStep(null, hookDefinition, hookParameter);
        return result;
    }
    async runStepHooks(stepHooks, pickleStep, stepResult) {
        const stepHooksResult = [];
        const hookParameter = {
            gherkinDocument: this.gherkinDocument,
            pickle: this.pickle,
            pickleStep,
            testCaseStartedId: this.currentTestCaseStartedId,
            testStepId: this.currentTestStepId,
            result: stepResult
        };
        for (const stepHookDefinition of stepHooks) {
            const { result } = await this.invokeStep(null, stepHookDefinition, hookParameter);
            stepHooksResult.push(result);
        }
        return stepHooksResult;
    }
    async runStep(pickleStep, testStep) {
        const stepDefinitions = testStep.stepDefinitionIds?.map(stepDefinitionId => {
            return findStepDefinition(stepDefinitionId, this.supportCodeLibrary);
        });
        if (!stepDefinitions || stepDefinitions.length === 0) {
            return {
                status: messages.TestStepResultStatus.UNDEFINED,
                duration: messages.TimeConversion.millisecondsToDuration(0)
            };
        }
        else if (stepDefinitions.length > 1) {
            return {
                message: (0, helpers_1.getAmbiguousStepException)(stepDefinitions),
                status: messages.TestStepResultStatus.AMBIGUOUS,
                duration: messages.TimeConversion.millisecondsToDuration(0)
            };
        }
        else if (this.isSkippingSteps()) {
            return {
                status: messages.TestStepResultStatus.SKIPPED,
                duration: messages.TimeConversion.millisecondsToDuration(0)
            };
        }
        // Get the step binding and scenario context so that we can
        // initialize any context objects before hooks are executed
        const stepBinding = this.bindingRegistry.getStepBindingByCucumberKey(stepDefinitions[0].options.cucumberKey);
        if (!stepBinding)
            throw (0, console_1.error)('===323 test-case-runner.ts: Unable to find StepBinding!');
        const scenarioContext = global.messageCollector.getStepScenarioContext(stepBinding);
        if (!scenarioContext)
            throw (0, console_1.error)('Unable to find the ManagedScenarioContext!');
        await this.initializeContext(stepBinding, scenarioContext);
        // next execute any before step hooks followed by the step if there are no
        // failures in before step hooks.
        let stepResult;
        let stepResults = await this.runStepHooks(this.getBeforeStepHookDefinitions(), pickleStep);
        if ((0, messages_1.getWorstTestStepResult)(stepResults).status !== messages.TestStepResultStatus.FAILED) {
            const { result } = await this.invokeStep(pickleStep, stepDefinitions[0]);
            stepResult = result;
            stepResults.push(stepResult);
        }
        // run the after step hooks
        const afterStepHookResults = await this.runStepHooks(this.getAfterStepHookDefinitions(), pickleStep, stepResult);
        stepResults = stepResults.concat(afterStepHookResults);
        const finalStepResult = (0, messages_1.getWorstTestStepResult)(stepResults);
        let finalDuration = messages.TimeConversion.millisecondsToDuration(0);
        for (const result of stepResults) {
            finalDuration = messages.TimeConversion.addDurations(finalDuration, result.duration);
        }
        finalStepResult.duration = finalDuration;
        return finalStepResult;
    }
    /**
     * Helper used to initialize any context types that are passed into
     * a binding class before any hooks or steps are executed.
     * @param stepBinding
     * @param scenarioContext
     */
    async initializeContext(stepBinding, scenarioContext) {
        const contextTypes = this.bindingRegistry.getContextTypesForClass(stepBinding.classPrototype);
        if (contextTypes.length > 0) {
            scenarioContext.getOrActivateBindingClass(stepBinding.classPrototype, contextTypes, this.world);
            const startTestCaseParameter = {
                gherkinDocument: this.gherkinDocument,
                pickle: this.pickle,
                testCaseStartedId: this.currentTestCaseStartedId
            };
            await scenarioContext.initialize(startTestCaseParameter);
        }
    }
}
exports.default = TestCaseRunner;
function findHookDefinition(id, supportCodeLibrary) {
    return [...supportCodeLibrary.beforeTestCaseHookDefinitions, ...supportCodeLibrary.afterTestCaseHookDefinitions].find(definition => definition.id === id);
}
function findStepDefinition(id, supportCodeLibrary) {
    return supportCodeLibrary.stepDefinitions.find(definition => definition.id === id);
}
//# sourceMappingURL=test-case-runner.js.map