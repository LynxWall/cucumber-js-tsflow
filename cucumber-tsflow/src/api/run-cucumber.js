"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCucumber = runCucumber;
const messages_1 = require("@cucumber/messages");
const events_1 = require("events");
const emit_support_code_messages_1 = require("@cucumber/cucumber/lib/api/emit_support_code_messages");
const index_1 = require("@cucumber/cucumber/lib/paths/index");
const make_runtime_1 = require("../runtime/make-runtime");
const formatters_1 = require("@cucumber/cucumber/lib/api/formatters");
const support_1 = require("./support");
const index_2 = require("@cucumber/cucumber/lib/environment/index");
const gherkin_1 = require("@cucumber/cucumber/lib/api/gherkin");
const message_collector_1 = __importDefault(require("../runtime/message-collector"));
const version_1 = require("../version");
const plugins_1 = require("@cucumber/cucumber/lib/api/plugins");
require("polyfill-symbol-metadata");
const binding_registry_1 = require("../bindings/binding-registry");
const console_1 = require("console");
const ansis_1 = __importDefault(require("ansis"));
const parallel_loader_1 = require("./parallel-loader");
const tsflow_logger_1 = require("../utils/tsflow-logger");
const runLogger = (0, tsflow_logger_1.createLogger)('run-cucumber');
/**
 * Execute a Cucumber test run.
 *
 * Extended from cucumber.js so that we can use our own implementation
 * of makeRuntime
 *
 * @public
 * @param options - Configuration loaded from `loadConfiguration`.
 * @param environment - Project environment.
 * @param onMessage - Callback fired each time Cucumber emits a message.
 */
async function runCucumber(options, environment = {}, onMessage) {
    const mergedEnvironment = (0, index_2.makeEnvironment)(environment);
    const { cwd, stdout, stderr, env, logger } = mergedEnvironment;
    logger.debug(`Running cucumber-tsflow ${version_1.version}
Working directory: ${cwd}
Running from: ${__dirname}
`);
    const consoleLogger = new console_1.Console(environment.stdout, environment.stderr);
    if (options.runtime.experimentalDecorators) {
        consoleLogger.info(ansis_1.default.yellowBright('Using Experimental Decorators.'));
    }
    if (options.runtime.parallel > 0) {
        consoleLogger.info(ansis_1.default.cyanBright(`Running Cucumber-TsFlow in Parallel with ${options.runtime.parallel} worker(s).\n`));
    }
    else {
        consoleLogger.info(ansis_1.default.cyanBright('Running Cucumber-TsFlow in Serial mode.\n'));
    }
    const newId = messages_1.IdGenerator.uuid();
    const supportCoordinates = 'originalCoordinates' in options.support
        ? options.support.originalCoordinates
        : Object.assign({
            requireModules: [],
            requirePaths: [],
            loaders: [],
            importPaths: []
        }, options.support);
    const pluginManager = await (0, plugins_1.initializeForRunCucumber)({
        ...options,
        support: supportCoordinates
    }, mergedEnvironment);
    const resolvedPaths = await (0, index_1.resolvePaths)(logger, cwd, options.sources, supportCoordinates);
    pluginManager.emit('paths:resolve', resolvedPaths);
    const { sourcePaths, requirePaths, importPaths } = resolvedPaths;
    /**
     * The support code library contains all of the hook and step definitions.
     * These are loaded into the library when calling getSupportCodeLibrary,
     * which loads all of the step definitions using require or import.
     */
    let supportCodeLibrary = 'originalCoordinates' in options.support
        ? options.support
        : await (async () => {
            // Parallel preload phase: warm transpiler caches in worker threads
            if (options.runtime.parallelLoad) {
                runLogger.checkpoint('Running parallel preload phase');
                consoleLogger.info(ansis_1.default.cyanBright('Pre-warming transpiler caches in parallel...\n'));
                try {
                    const result = await (0, parallel_loader_1.parallelPreload)({
                        requirePaths,
                        importPaths,
                        requireModules: supportCoordinates.requireModules,
                        loaders: supportCoordinates.loaders,
                        experimentalDecorators: options.runtime.experimentalDecorators,
                        threadCount: options.runtime.parallelLoad
                    });
                    runLogger.checkpoint('Parallel preload completed', {
                        descriptors: result.descriptors.length,
                        files: result.loadedFiles.length,
                        durationMs: result.durationMs
                    });
                    consoleLogger.info(ansis_1.default.cyanBright(`Parallel preload completed in ${result.durationMs}ms ` +
                        `(${result.loadedFiles.length} files, ${result.descriptors.length} bindings)\n`));
                }
                catch (err) {
                    runLogger.error('Parallel preload failed, falling back to serial load', err);
                }
            }
            return (0, support_1.getSupportCodeLibrary)({
                logger,
                cwd,
                newId,
                requirePaths,
                requireModules: supportCoordinates.requireModules,
                importPaths,
                loaders: supportCoordinates.loaders
            });
        })();
    // Set support to the updated step and hook definitions
    // in the supportCodeLibrary. We also need to initialize originalCoordinates
    // to support parallel execution.
    supportCodeLibrary = binding_registry_1.BindingRegistry.instance.updateSupportCodeLibrary(supportCodeLibrary);
    supportCodeLibrary = { ...supportCodeLibrary, ...{ originalCoordinates: supportCoordinates } };
    options.support = supportCodeLibrary;
    const eventBroadcaster = new events_1.EventEmitter();
    if (onMessage) {
        eventBroadcaster.on('envelope', onMessage);
    }
    eventBroadcaster.on('envelope', value => pluginManager.emit('message', value));
    // create a global instance of the message collector and bind it
    // to the event broadcaster. This is used by cucumber and for tests
    // that are not running in parallel.
    global.messageCollector = new message_collector_1.default(eventBroadcaster);
    // cast the MessageCollector to an EventDataCollector
    const eventDataCollector = global.messageCollector;
    let formatterStreamError = false;
    const cleanupFormatters = await (0, formatters_1.initializeFormatters)({
        env,
        cwd,
        stdout,
        stderr,
        logger,
        onStreamError: () => (formatterStreamError = true),
        eventBroadcaster,
        eventDataCollector: eventDataCollector,
        configuration: options.formats,
        supportCodeLibrary,
        pluginManager
    });
    await (0, emit_support_code_messages_1.emitMetaMessage)(eventBroadcaster, env);
    let filteredPickles = [];
    let parseErrors = [];
    if (sourcePaths.length > 0) {
        const gherkinResult = await (0, gherkin_1.getPicklesAndErrors)({
            newId,
            cwd,
            sourcePaths,
            coordinates: options.sources,
            onEnvelope: envelope => eventBroadcaster.emit('envelope', envelope)
        });
        filteredPickles = await pluginManager.transform('pickles:filter', gherkinResult.filterablePickles);
        filteredPickles = await pluginManager.transform('pickles:order', filteredPickles);
        parseErrors = gherkinResult.parseErrors;
    }
    if (parseErrors.length) {
        parseErrors.forEach(parseError => {
            logger.error(`Parse error in "${parseError.source.uri}" ${parseError.message}`);
        });
        await cleanupFormatters();
        await pluginManager.cleanup();
        return {
            success: false,
            support: supportCodeLibrary
        };
    }
    (0, emit_support_code_messages_1.emitSupportCodeMessages)({
        eventBroadcaster,
        supportCodeLibrary,
        newId
    });
    const runtime = await (0, make_runtime_1.makeRuntime)({
        environment,
        logger,
        eventBroadcaster,
        sourcedPickles: filteredPickles,
        newId,
        supportCodeLibrary,
        options: options.runtime,
        coordinates: options.sources
    });
    const success = await runtime.run();
    await pluginManager.cleanup();
    await cleanupFormatters();
    return {
        success: success && !formatterStreamError,
        support: supportCodeLibrary
    };
}
//# sourceMappingURL=run-cucumber.js.map