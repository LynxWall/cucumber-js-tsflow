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

// Shim 'window' for libraries that expect a browser environment in worker threads
if (typeof globalThis.window === 'undefined') {
	(globalThis as Record<string, unknown>).window = globalThis;
}

import { parentPort, workerData } from 'node:worker_threads';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import 'polyfill-symbol-metadata';

// Signal that we're in a loader-worker context so decorators skip Cucumber APIs
(global as any).__LOADER_WORKER = true;

/** Message types sent from main thread to worker */
export interface LoaderWorkerRequest {
	type: 'LOAD';
	/** Absolute paths to load via require() */
	requirePaths: string[];
	/** Absolute paths to load via import() */
	importPaths: string[];
	/** Modules to require before support code (transpiler setup etc.) */
	requireModules: string[];
	/** ESM loaders to register before importing */
	loaders: string[];
	/** Whether to use experimental decorators */
	experimentalDecorators: boolean;
}

/** Message types sent from worker back to main thread */
export interface LoaderWorkerResponse {
	type: 'LOADED' | 'ERROR';
	/** Serializable binding descriptors extracted from the registry */
	descriptors?: import('../bindings/step-binding').SerializableBindingDescriptor[];
	/** Source files that were successfully loaded */
	loadedFiles?: string[];
	/** Error message if something went wrong */
	error?: string;
}

async function processMessage(message: LoaderWorkerRequest): Promise<void> {
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
			register(specifier, pathToFileURL('./'));
		}

		// Load support files via import (ESM)
		for (const filePath of message.importPaths) {
			await import(pathToFileURL(filePath).toString());
		}

		// Extract descriptors from the binding registry
		const { BindingRegistry } = require('../bindings/binding-registry');
		const registry = BindingRegistry.instance;
		const descriptors = registry.toDescriptors();
		const loadedFiles: string[] = Array.from(registry.getDescriptorSourceFiles());

		const response: LoaderWorkerResponse = {
			type: 'LOADED',
			descriptors,
			loadedFiles
		};
		parentPort!.postMessage(response);
	} catch (err: any) {
		const response: LoaderWorkerResponse = {
			type: 'ERROR',
			error: err.message || String(err)
		};
		parentPort!.postMessage(response);
	}
}

// Handle initial workerData (if files are passed at construction time)
if (workerData && workerData.type === 'LOAD') {
	processMessage(workerData as LoaderWorkerRequest);
}

// Handle messages posted after construction
parentPort?.on('message', (msg: LoaderWorkerRequest) => processMessage(msg));
