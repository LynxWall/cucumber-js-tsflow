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
exports.Worker = void 0;
const messages = __importStar(require("@cucumber/messages"));
const test_case_runner_1 = __importDefault(require("./test-case-runner"));
const helpers_1 = require("@cucumber/cucumber/lib/runtime/helpers");
class Worker {
    workerId;
    eventBroadcaster;
    newId;
    options;
    supportCodeLibrary;
    constructor(workerId, eventBroadcaster, newId, options, supportCodeLibrary) {
        this.workerId = workerId;
        this.eventBroadcaster = eventBroadcaster;
        this.newId = newId;
        this.options = options;
        this.supportCodeLibrary = supportCodeLibrary;
    }
    async runBeforeAllHooks() {
        const results = [];
        for (const hookDefinition of this.supportCodeLibrary.beforeTestRunHookDefinitions) {
            const result = await this.runTestRunHook(hookDefinition, 'a BeforeAll');
            results.push(result);
        }
        return results;
    }
    async runTestCase({ gherkinDocument, pickle, testCase }, failing) {
        const testCaseRunner = new test_case_runner_1.default({
            workerId: this.workerId,
            eventBroadcaster: this.eventBroadcaster,
            newId: this.newId,
            gherkinDocument,
            pickle,
            testCase,
            retries: (0, helpers_1.retriesForPickle)(pickle, this.options),
            skip: this.options.dryRun || (this.options.failFast && failing),
            filterStackTraces: this.options.filterStacktraces,
            supportCodeLibrary: this.supportCodeLibrary,
            worldParameters: this.options.worldParameters
        });
        const status = await testCaseRunner.run();
        return !(0, helpers_1.shouldCauseFailure)(status, this.options);
    }
    async runAfterAllHooks() {
        const results = [];
        const hooks = this.supportCodeLibrary.afterTestRunHookDefinitions.slice(0).reverse();
        for (const hookDefinition of hooks) {
            const result = await this.runTestRunHook(hookDefinition, 'an AfterAll');
            results.push(result);
        }
        return results;
    }
    /**
     * Run a single test-run hook (BeforeAll/AfterAll).
     * Replicates the logic previously in makeRunTestRunHooks which was removed
     * from Cucumber 12.3+.
     */
    async runTestRunHook(hookDefinition, name) {
        if (this.options.dryRun) {
            return {
                result: {
                    status: messages.TestStepResultStatus.SKIPPED,
                    duration: { seconds: 0, nanos: 0 }
                }
            };
        }
        try {
            await hookDefinition.code.apply(null, []);
            return {
                result: {
                    status: messages.TestStepResultStatus.PASSED,
                    duration: { seconds: 0, nanos: 0 }
                }
            };
        }
        catch (error) {
            let errorMessage = `${name} hook errored`;
            if (this.workerId) {
                errorMessage += ` on worker ${this.workerId}`;
            }
            const location = `${hookDefinition.uri}:${hookDefinition.line}`;
            errorMessage += `, process exiting: ${location}`;
            return {
                result: {
                    status: messages.TestStepResultStatus.FAILED,
                    duration: { seconds: 0, nanos: 0 },
                    message: error.message || errorMessage,
                    exception: {
                        type: error.constructor?.name || 'Error',
                        message: error.message || errorMessage
                    }
                },
                error
            };
        }
    }
}
exports.Worker = Worker;
//# sourceMappingURL=worker.js.map