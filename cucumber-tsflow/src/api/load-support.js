"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSupport = loadSupport;
exports.reloadSupport = reloadSupport;
const messages_1 = require("@cucumber/messages");
const index_1 = require("@cucumber/cucumber/lib/paths/index");
const index_2 = require("@cucumber/cucumber/lib/environment/index");
const support_1 = require("./support");
const plugins_1 = require("@cucumber/cucumber/lib/api/plugins");
const binding_registry_1 = require("../bindings/binding-registry");
const parallel_loader_1 = require("./parallel-loader");
const tsflow_logger_1 = require("../utils/tsflow-logger");
const logger = (0, tsflow_logger_1.createLogger)('load-support');
/**
 * Load support code for use in test runs
 *
 * @public
 * @param options - Options required to find the support code
 * @param environment - Project environment
 */
async function loadSupport(options, environment = {}) {
    const mergedEnvironment = (0, index_2.makeEnvironment)(environment);
    const { cwd, logger: cucumberLogger } = mergedEnvironment;
    const newId = messages_1.IdGenerator.uuid();
    const supportCoordinates = Object.assign({
        requireModules: [],
        requirePaths: [],
        loaders: [],
        importPaths: []
    }, options.support);
    const pluginManager = await (0, plugins_1.initializeForLoadSupport)(mergedEnvironment);
    const resolvedPaths = await (0, index_1.resolvePaths)(cucumberLogger, cwd, options.sources, supportCoordinates);
    pluginManager.emit('paths:resolve', resolvedPaths);
    const { requirePaths, importPaths } = resolvedPaths;
    // Parallel preload phase: warm transpiler caches in worker threads
    if (options.parallelLoad) {
        logger.checkpoint('Running parallel preload phase');
        try {
            const result = await (0, parallel_loader_1.parallelPreload)({
                requirePaths,
                importPaths,
                requireModules: supportCoordinates.requireModules,
                loaders: supportCoordinates.loaders,
                experimentalDecorators: options.experimentalDecorators ?? false,
                threadCount: options.parallelLoad
            });
            logger.checkpoint('Parallel preload completed', {
                descriptors: result.descriptors.length,
                files: result.loadedFiles.length,
                durationMs: result.durationMs
            });
        }
        catch (err) {
            logger.error('Parallel preload failed, falling back to serial load', err);
        }
    }
    let supportCodeLibrary = await (0, support_1.getSupportCodeLibrary)({
        logger: cucumberLogger,
        cwd,
        newId,
        requireModules: supportCoordinates.requireModules,
        requirePaths,
        loaders: supportCoordinates.loaders,
        importPaths
    });
    await pluginManager.cleanup();
    // Set support to the updated step and hook definitions
    // in the supportCodeLibrary. We also need to initialize originalCoordinates
    // to support parallel execution.
    supportCodeLibrary = binding_registry_1.BindingRegistry.instance.updateSupportCodeLibrary(supportCodeLibrary);
    supportCodeLibrary = { ...supportCodeLibrary, ...{ originalCoordinates: supportCoordinates } };
    return supportCodeLibrary;
}
/**
 * Incrementally reload support code. Evicts support modules from Node's
 * require cache so they are re-evaluated (re-running decorator registrations).
 * Transpiler caches (ts-node, swc, etc.) handle skipping recompilation for
 * unchanged files, making this significantly faster than a full loadSupport.
 *
 * @public
 * @param options - The same run options used for the original loadSupport call
 * @param changedPaths - Absolute paths to files that have changed since the
 *                       last load. If empty, all support modules are evicted
 *                       and re-evaluated (equivalent to a full reload).
 * @param environment - Project environment
 */
async function reloadSupport(options, changedPaths, environment = {}) {
    const mergedEnvironment = (0, index_2.makeEnvironment)(environment);
    const { cwd, logger: cucumberLogger } = mergedEnvironment;
    const newId = messages_1.IdGenerator.uuid();
    const supportCoordinates = Object.assign({
        requireModules: [],
        requirePaths: [],
        loaders: [],
        importPaths: []
    }, options.support);
    const pluginManager = await (0, plugins_1.initializeForLoadSupport)(mergedEnvironment);
    const resolvedPaths = await (0, index_1.resolvePaths)(cucumberLogger, cwd, options.sources, supportCoordinates);
    pluginManager.emit('paths:resolve', resolvedPaths);
    const { requirePaths, importPaths } = resolvedPaths;
    // Evict support modules from require.cache so they re-evaluate on next require().
    // Transpiler caches ensure unchanged files don't pay recompilation cost.
    if (changedPaths.length > 0) {
        evictChangedAndDependents(changedPaths, requirePaths);
    }
    else {
        evictAllSupportModules(requirePaths);
    }
    let supportCodeLibrary = await (0, support_1.getSupportCodeLibrary)({
        logger: cucumberLogger,
        cwd,
        newId,
        requireModules: supportCoordinates.requireModules,
        requirePaths,
        loaders: supportCoordinates.loaders,
        importPaths
    });
    await pluginManager.cleanup();
    supportCodeLibrary = binding_registry_1.BindingRegistry.instance.updateSupportCodeLibrary(supportCodeLibrary);
    supportCodeLibrary = { ...supportCodeLibrary, ...{ originalCoordinates: supportCoordinates } };
    return supportCodeLibrary;
}
/**
 * Evict changed files and any support modules that depend on them
 * from Node's require cache.
 */
function evictChangedAndDependents(changedPaths, allSupportPaths) {
    // Resolve all changed paths
    const changedResolved = new Set();
    for (const p of changedPaths) {
        try {
            changedResolved.add(require.resolve(p));
        }
        catch {
            // File may have been deleted — skip
        }
    }
    // Build set of modules to evict: changed files + any support module
    // whose dependency subtree includes a changed file
    const toEvict = new Set(changedResolved);
    // Walk require.cache to find transitive dependents
    let found = true;
    while (found) {
        found = false;
        for (const [key, mod] of Object.entries(require.cache)) {
            if (!toEvict.has(key) && mod?.children?.some(child => toEvict.has(child.id))) {
                toEvict.add(key);
                found = true;
            }
        }
    }
    // Only evict modules that are changed or in the support paths set
    // (don't evict node_modules or unrelated files)
    const supportResolved = new Set(allSupportPaths
        .map(p => {
        try {
            return require.resolve(p);
        }
        catch {
            return '';
        }
    })
        .filter(Boolean));
    for (const key of toEvict) {
        if (changedResolved.has(key) || supportResolved.has(key)) {
            delete require.cache[key];
        }
    }
}
/**
 * Evict all support modules from Node's require cache.
 * Used when no specific changed paths are provided.
 */
function evictAllSupportModules(supportPaths) {
    for (const filePath of supportPaths) {
        try {
            const resolved = require.resolve(filePath);
            delete require.cache[resolved];
        }
        catch {
            // File may not be resolvable — skip
        }
    }
}
//# sourceMappingURL=load-support.js.map