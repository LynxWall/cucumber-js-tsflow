"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parallelPreload = parallelPreload;
/**
 * parallel-loader.ts
 *
 * Orchestrates parallel pre-warming of transpiler caches using worker_threads.
 * Each worker loads a subset of support-code files, warming the transpiler's
 * on-disk cache. After all workers finish, the main thread performs the
 * authoritative load (which hits warm caches and runs much faster).
 *
 * The descriptors returned by workers are used for validation — the main
 * thread's BindingRegistry is the canonical source of truth.
 */
const node_worker_threads_1 = require("node:worker_threads");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const tsflow_logger_1 = require("../utils/tsflow-logger");
const logger = (0, tsflow_logger_1.createLogger)('parallel-loader');
/**
 * Pre-warm transpiler caches by loading support files in parallel worker threads.
 *
 * Each worker receives a subset of files, loads them (which triggers transpilation),
 * and returns serializable binding descriptors. The transpiler cache on disk is now
 * warm for the main thread's subsequent load.
 */
async function parallelPreload(options) {
    const start = performance.now();
    const threads = resolveThreadCount(options.threadCount);
    logger.checkpoint('Starting parallel preload', {
        threads,
        requirePaths: options.requirePaths.length,
        importPaths: options.importPaths.length
    });
    // Split files across workers — round-robin distribution
    const requireChunks = chunkRoundRobin(options.requirePaths, threads);
    const importChunks = chunkRoundRobin(options.importPaths, threads);
    // Resolve the worker script path (compiled JS in lib/)
    const workerScript = resolveWorkerScript();
    logger.checkpoint('Worker script resolved', { workerScript });
    // Launch workers
    const workerPromises = [];
    for (let i = 0; i < threads; i++) {
        // Only launch a worker if it has files to process
        if (requireChunks[i].length === 0 && importChunks[i].length === 0) {
            continue;
        }
        const request = {
            type: 'LOAD',
            requirePaths: requireChunks[i],
            importPaths: importChunks[i],
            requireModules: options.requireModules,
            loaders: options.loaders,
            experimentalDecorators: options.experimentalDecorators
        };
        workerPromises.push(runWorker(workerScript, request, i));
    }
    // Await all workers
    const results = await Promise.allSettled(workerPromises);
    // Collect results
    const allDescriptors = [];
    const allFiles = new Set();
    let errors = 0;
    for (const result of results) {
        if (result.status === 'fulfilled') {
            const response = result.value;
            if (response.type === 'LOADED') {
                if (response.descriptors) {
                    allDescriptors.push(...response.descriptors);
                }
                if (response.loadedFiles) {
                    response.loadedFiles.forEach(f => allFiles.add(f));
                }
            }
            else {
                errors++;
                logger.error('Worker reported error', new Error(response.error || 'Unknown worker error'));
            }
        }
        else {
            errors++;
            logger.error('Worker promise rejected', result.reason);
        }
    }
    const durationMs = Math.round(performance.now() - start);
    logger.checkpoint('Parallel preload completed', {
        durationMs,
        descriptorCount: allDescriptors.length,
        fileCount: allFiles.size,
        errors
    });
    if (errors > 0) {
        logger.checkpoint('Some workers failed — main thread will do full load as fallback');
    }
    return {
        descriptors: allDescriptors,
        loadedFiles: Array.from(allFiles),
        durationMs
    };
}
/**
 * Run a single loader-worker and return its response.
 */
function runWorker(workerScript, request, index) {
    return new Promise((resolve, reject) => {
        const worker = new node_worker_threads_1.Worker(workerScript, {
            workerData: request
        });
        let settled = false;
        worker.on('message', (msg) => {
            if (!settled) {
                settled = true;
                logger.checkpoint(`Worker ${index} completed`, { type: msg.type });
                worker.terminate();
                resolve(msg);
            }
        });
        worker.on('error', err => {
            if (!settled) {
                settled = true;
                logger.error(`Worker ${index} error`, err);
                reject(err);
            }
        });
        worker.on('exit', code => {
            if (!settled) {
                settled = true;
                if (code !== 0) {
                    reject(new Error(`Worker ${index} exited with code ${code}`));
                }
            }
        });
    });
}
/**
 * Resolve the number of threads to use.
 * - true: use availableParallelism() capped at 4
 * - number: use that exact count (min 1)
 */
function resolveThreadCount(threadCount) {
    if (typeof threadCount === 'number') {
        return Math.max(1, threadCount);
    }
    // Auto-detect: use available parallelism, capped at a reasonable default
    return Math.min((0, node_os_1.availableParallelism)(), 4);
}
/**
 * Distribute items round-robin across N buckets.
 */
function chunkRoundRobin(items, buckets) {
    const chunks = Array.from({ length: buckets }, () => []);
    for (let i = 0; i < items.length; i++) {
        chunks[i % buckets].push(items[i]);
    }
    return chunks;
}
/**
 * Resolve the path to the compiled loader-worker script.
 * In development (src), this file is adjacent; in production (lib/), it's compiled.
 */
function resolveWorkerScript() {
    // Try the compiled lib path first, falling back to __dirname
    const libPath = node_path_1.default.resolve(__dirname, 'loader-worker.js');
    return libPath;
}
//# sourceMappingURL=parallel-loader.js.map