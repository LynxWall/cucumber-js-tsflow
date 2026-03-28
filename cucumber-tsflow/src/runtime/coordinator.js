"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Coordinator = void 0;
const index_1 = require("@cucumber/cucumber/lib/assemble/index");
const stopwatch_1 = require("@cucumber/cucumber/lib/runtime/stopwatch");
class Coordinator {
    testRunStartedId;
    eventBroadcaster;
    newId;
    sourcedPickles;
    supportCodeLibrary;
    adapter;
    constructor(testRunStartedId, eventBroadcaster, newId, sourcedPickles, supportCodeLibrary, adapter) {
        this.testRunStartedId = testRunStartedId;
        this.eventBroadcaster = eventBroadcaster;
        this.newId = newId;
        this.sourcedPickles = sourcedPickles;
        this.supportCodeLibrary = supportCodeLibrary;
        this.adapter = adapter;
    }
    async run() {
        const testRunStartedId = this.testRunStartedId;
        this.eventBroadcaster.emit('envelope', {
            testRunStarted: {
                id: testRunStartedId,
                timestamp: (0, stopwatch_1.timestamp)()
            }
        });
        const assembledTestCases = await (0, index_1.assembleTestCases)(testRunStartedId, this.eventBroadcaster, this.newId, this.sourcedPickles, this.supportCodeLibrary);
        const success = await this.adapter.run(assembledTestCases);
        this.eventBroadcaster.emit('envelope', {
            testRunFinished: {
                testRunStartedId,
                timestamp: (0, stopwatch_1.timestamp)(),
                success
            }
        });
        return success;
    }
}
exports.Coordinator = Coordinator;
//# sourceMappingURL=coordinator.js.map