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
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import type { LoaderWorkerRequest, LoaderWorkerResponse } from './loader-worker';
import type { SerializableBindingDescriptor } from '../bindings/step-binding';
import { createLogger } from '../utils/tsflow-logger';

const logger = createLogger('parallel-loader');

export interface ParallelLoadOptions {
	/** Absolute require-paths for CJS support files */
	requirePaths: string[];
	/** Absolute import-paths for ESM support files */
	importPaths: string[];
	/** Modules to require before support code (transpiler hooks) */
	requireModules: string[];
	/** ESM loaders to register */
	loaders: string[];
	/** Whether experimental decorators are enabled */
	experimentalDecorators: boolean;
	/** Number of threads (true = auto, number = explicit) */
	threadCount: boolean | number;
}

export interface ParallelLoadResult {
	/** All descriptors collected across workers (for validation) */
	descriptors: SerializableBindingDescriptor[];
	/** Unique source files loaded across all workers */
	loadedFiles: string[];
	/** Time spent in parallel phase (ms) */
	durationMs: number;
}

/**
 * Pre-warm transpiler caches by loading support files in parallel worker threads.
 *
 * Each worker receives a subset of files, loads them (which triggers transpilation),
 * and returns serializable binding descriptors. The transpiler cache on disk is now
 * warm for the main thread's subsequent load.
 */
export async function parallelPreload(options: ParallelLoadOptions): Promise<ParallelLoadResult> {
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
	const workerPromises: Promise<LoaderWorkerResponse>[] = [];

	for (let i = 0; i < threads; i++) {
		// Only launch a worker if it has files to process
		if (requireChunks[i].length === 0 && importChunks[i].length === 0) {
			continue;
		}

		const request: LoaderWorkerRequest = {
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
	const allDescriptors: SerializableBindingDescriptor[] = [];
	const allFiles = new Set<string>();
	let errors = 0;
	let fileWarnings = 0;

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
				// Per-file errors are non-fatal — the file just didn't contribute to the cache
				if (response.fileErrors && response.fileErrors.length > 0) {
					fileWarnings += response.fileErrors.length;
					for (const fe of response.fileErrors) {
						logger.checkpoint('File skipped during preload', { detail: fe });
					}
				}
			} else {
				errors++;
				logger.error('Worker reported error', new Error(response.error || 'Unknown worker error'));
				if (response.fileErrors) {
					for (const fe of response.fileErrors) {
						logger.checkpoint('File skipped during preload', { detail: fe });
					}
				}
			}
		} else {
			errors++;
			logger.error('Worker promise rejected', result.reason);
		}
	}

	const durationMs = Math.round(performance.now() - start);
	logger.checkpoint('Parallel preload completed', {
		durationMs,
		descriptorCount: allDescriptors.length,
		fileCount: allFiles.size,
		errors,
		fileWarnings
	});

	if (errors > 0) {
		logger.checkpoint('Some workers failed — main thread will do full load as fallback');
	}
	if (fileWarnings > 0) {
		logger.checkpoint(`${fileWarnings} file(s) skipped during preload — these will be loaded by the main thread`);
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
function runWorker(workerScript: string, request: LoaderWorkerRequest, index: number): Promise<LoaderWorkerResponse> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(workerScript, {
			workerData: request
		});

		let settled = false;

		worker.on('message', (msg: LoaderWorkerResponse) => {
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
function resolveThreadCount(threadCount: boolean | number): number {
	if (typeof threadCount === 'number') {
		return Math.max(1, threadCount);
	}
	// Auto-detect: use available parallelism, capped at a reasonable default
	return Math.min(availableParallelism(), 4);
}

/**
 * Distribute items round-robin across N buckets.
 */
function chunkRoundRobin<T>(items: T[], buckets: number): T[][] {
	const chunks: T[][] = Array.from({ length: buckets }, (): T[] => []);
	for (let i = 0; i < items.length; i++) {
		chunks[i % buckets].push(items[i]);
	}
	return chunks;
}

/**
 * Resolve the path to the compiled loader-worker script.
 * In development (src), this file is adjacent; in production (lib/), it's compiled.
 */
function resolveWorkerScript(): string {
	// Try the compiled lib path first, falling back to __dirname
	const libPath = path.resolve(__dirname, 'loader-worker.js');
	return libPath;
}
