"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChildProcessWorker = void 0;
const node_events_1 = require("node:events");
const node_url_1 = require("node:url");
const node_module_1 = require("node:module");
const messages_1 = require("@cucumber/messages");
const index_1 = __importDefault(require("@cucumber/cucumber/lib/support_code_library_builder/index"));
const try_require_1 = __importDefault(require("@cucumber/cucumber/lib/try_require"));
const worker_1 = require("../worker");
const logger_1 = __importDefault(require("../../utils/logger"));
const paths_1 = require("@cucumber/cucumber/lib/paths/paths");
const binding_registry_1 = require("../../bindings/binding-registry");
const message_collector_1 = __importDefault(require("../message-collector"));
const { uuid } = messages_1.IdGenerator;
/**
 * Represents a child process running in parallel executions
 */
class ChildProcessWorker {
    cwd;
    exit;
    id;
    eventBroadcaster;
    newId;
    sendMessage;
    options;
    supportCodeLibrary;
    worker;
    constructor({ cwd, exit, id, sendMessage, experimentalDecorators }) {
        this.id = id;
        this.newId = uuid();
        this.cwd = cwd;
        this.exit = exit;
        this.sendMessage = sendMessage;
        this.eventBroadcaster = new node_events_1.EventEmitter();
        // initialize a message collector for this process to handle our
        // integration with event data
        global.messageCollector = new message_collector_1.default(this.eventBroadcaster);
        // initialize the global experimentalDecorators setting
        global.experimentalDecorators = experimentalDecorators;
        // pass any envelope messages up to the parent process to keep our main
        // message collector in sync with this one.
        this.eventBroadcaster.on('envelope', (envelope) => this.sendMessage({ type: 'ENVELOPE', envelope }));
    }
    /**
     * Initialize this child process worker
     */
    async initialize({ supportCodeCoordinates, supportCodeIds, options, messageData }) {
        // reset the message collector with message data passed in
        global.messageCollector.reset(messageData);
        // Get correct paths and reset the support code library
        const resolvedPaths = await (0, paths_1.resolvePaths)(logger_1.default, this.cwd, messageData.coordinates, supportCodeCoordinates);
        const { requirePaths, importPaths } = resolvedPaths;
        index_1.default.reset(this.cwd, this.newId, {
            requirePaths,
            requireModules: supportCodeCoordinates.requireModules,
            importPaths,
            loaders: supportCodeCoordinates.loaders
        });
        // Define the boolean type before loading any support code
        index_1.default.defineParameterType({
            name: 'boolean',
            regexp: /true|false/,
            transformer: s => (s === 'true' ? true : false)
        });
        // Load any require modules for CommonJS or loaders and imports for ESM
        supportCodeCoordinates.requireModules.map(module => (0, try_require_1.default)(module));
        requirePaths.map(module => (0, try_require_1.default)(module));
        for (const specifier of supportCodeCoordinates.loaders) {
            (0, node_module_1.register)(specifier, (0, node_url_1.pathToFileURL)('./'));
        }
        for (const path of importPaths) {
            await import((0, node_url_1.pathToFileURL)(path).toString());
        }
        // Finalize the support code library with IDs passed in and
        // update entries in the library with info from our binding registry.
        this.supportCodeLibrary = index_1.default.finalize(supportCodeIds);
        this.supportCodeLibrary = binding_registry_1.BindingRegistry.instance.updateSupportCodeLibrary(this.supportCodeLibrary);
        // Initialize a worker and run BeforeAll hooks
        this.options = options;
        this.worker = new worker_1.Worker(this.id, this.eventBroadcaster, this.newId, this.options, this.supportCodeLibrary);
        await this.worker.runBeforeAllHooks();
        this.sendMessage({ type: 'READY' });
    }
    /**
     * Finialize the worker, which runs AfterAll hooks
     */
    async finalize() {
        await this.worker.runAfterAllHooks();
        this.exit(0);
    }
    /**
     * Interaction with the main process and child workers is done through IPC communications
     * This receives commands from the parent process and calls appropriate child operations.
     * @param command commands sent to this worker
     */
    async receiveMessage(command) {
        switch (command.type) {
            case 'INITIALIZE':
                await this.initialize(command);
                break;
            case 'RUN':
                await this.runTestCase(command);
                break;
            case 'FINALIZE':
                await this.finalize();
                break;
        }
    }
    /**
     * Run all test cases on the worker
     * @param command RunCommand
     */
    async runTestCase(command) {
        const success = await this.worker.runTestCase(command.assembledTestCase, command.failing);
        this.sendMessage({
            type: 'FINISHED',
            success
        });
    }
}
exports.ChildProcessWorker = ChildProcessWorker;
//# sourceMappingURL=worker.js.map