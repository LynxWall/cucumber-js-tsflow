"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * loader-worker.ts
 *
 * Runs inside a worker_threads Worker. Receives support-code file paths and
 * transpiler configuration, loads the files (warming the transpiler cache),
 * extracts serializable binding descriptors from the BindingRegistry, and
 * posts them back to the main thread.
 *
 * The __LOADER_WORKER global flag causes the binding decorator to skip
 * Cucumber step/hook registration — only BindingRegistry population occurs.
 */
const node_worker_threads_1 = require("node:worker_threads");
const node_module_1 = require("node:module");
const node_url_1 = require("node:url");
require("polyfill-symbol-metadata");
// Signal that we're in a loader-worker context so decorators skip Cucumber APIs
global.__LOADER_WORKER = true;
async function processMessage(message) {
    if (message.type !== 'LOAD') {
        return;
    }
    try {
        // Set the experimental decorators flag before loading support code
        global.experimentalDecorators = message.experimentalDecorators;
        process.env.CUCUMBER_EXPERIMENTAL_DECORATORS = String(message.experimentalDecorators);
        // Load require modules (transpiler setup)
        for (const modulePath of message.requireModules) {
            require(modulePath);
        }
        // Load support files via require (CJS)
        for (const filePath of message.requirePaths) {
            require(filePath);
        }
        // Register ESM loaders
        for (const specifier of message.loaders) {
            (0, node_module_1.register)(specifier, (0, node_url_1.pathToFileURL)('./'));
        }
        // Load support files via import (ESM)
        for (const filePath of message.importPaths) {
            await import((0, node_url_1.pathToFileURL)(filePath).toString());
        }
        // Extract descriptors from the binding registry
        const { BindingRegistry } = require('../bindings/binding-registry');
        const registry = BindingRegistry.instance;
        const descriptors = registry.toDescriptors();
        const loadedFiles = Array.from(registry.getDescriptorSourceFiles());
        const response = {
            type: 'LOADED',
            descriptors,
            loadedFiles
        };
        node_worker_threads_1.parentPort.postMessage(response);
    }
    catch (err) {
        const response = {
            type: 'ERROR',
            error: err.message || String(err)
        };
        node_worker_threads_1.parentPort.postMessage(response);
    }
}
// Handle initial workerData (if files are passed at construction time)
if (node_worker_threads_1.workerData && node_worker_threads_1.workerData.type === 'LOAD') {
    processMessage(node_worker_threads_1.workerData);
}
// Handle messages posted after construction
node_worker_threads_1.parentPort?.on('message', (msg) => processMessage(msg));
//# sourceMappingURL=loader-worker.js.map