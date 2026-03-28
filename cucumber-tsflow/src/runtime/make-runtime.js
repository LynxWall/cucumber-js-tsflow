"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeRuntime = makeRuntime;
const adapter_1 = require("./parallel/adapter");
const adapter_2 = require("./serial/adapter");
const coordinator_1 = require("./coordinator");
/**
 * Extending this function from cucumber.js to use our own implementation
 * of the Coordinator.
 */
async function makeRuntime({ environment, logger, eventBroadcaster, sourcedPickles, newId, supportCodeLibrary, options, coordinates, snippetOptions = {} }) {
    const testRunStartedId = newId();
    const adapter = options.parallel > 0
        ? new adapter_1.ChildProcessAdapter(testRunStartedId, environment, logger, eventBroadcaster, options, snippetOptions, supportCodeLibrary, coordinates)
        : new adapter_2.InProcessAdapter(testRunStartedId, eventBroadcaster, newId, options, supportCodeLibrary);
    return new coordinator_1.Coordinator(testRunStartedId, eventBroadcaster, newId, sourcedPickles, supportCodeLibrary, adapter);
}
//# sourceMappingURL=make-runtime.js.map