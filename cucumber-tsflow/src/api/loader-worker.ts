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

// Shim browser globals for libraries that expect a browser environment in worker threads.
// Workers are a constrained Node.js environment — many libraries probe for browser APIs
// during module evaluation. These stubs prevent "Cannot read properties of undefined" errors.
// Aligned with the globals expected by @uis/testing-bdd (uis-jest setup).
if (typeof globalThis.window === 'undefined') {
	const noop = (): void => {};
	const noopObj = new Proxy({}, { get: () => noop });

	// Helper: safely set a global property (some like `navigator` are getter-only in modern Node)
	const safeDefine = (target: object, key: string, value: unknown): void => {
		try {
			Object.defineProperty(target, key, { value, writable: true, configurable: true });
		} catch {
			// Property may be non-configurable — ignore and move on
		}
	};

	// Minimal location stub — covers window.location.href / .origin / .protocol etc.
	const locationStub = {
		href: '',
		origin: '',
		protocol: 'file:',
		host: '',
		hostname: '',
		port: '',
		pathname: '',
		search: '',
		hash: '',
		assign: noop,
		replace: noop,
		reload: noop,
		toString: () => ''
	};

	// Minimal document stub — covers document.createElement, querySelector, etc.
	const documentStub = {
		createElement: (): unknown => noopObj,
		createElementNS: (): unknown => noopObj,
		createTextNode: (): unknown => noopObj,
		createDocumentFragment: (): unknown => noopObj,
		createComment: (): unknown => noopObj,
		getElementById: (): null => null,
		getElementsByClassName: (): unknown[] => [],
		getElementsByTagName: (): unknown[] => [],
		querySelector: (): null => null,
		querySelectorAll: (): unknown[] => [],
		head: noopObj,
		body: noopObj,
		documentElement: noopObj,
		addEventListener: noop,
		removeEventListener: noop,
		dispatchEvent: noop,
		cookie: ''
	};

	// Minimal navigator stub
	const navigatorStub = {
		userAgent: 'node',
		platform: process.platform,
		language: 'en',
		languages: ['en']
	};

	// Fake localStorage — matches @uis/testing-bdd FakeLocalStorage
	const localStorageStub = {
		store: {} as Record<string, string>,
		clear(): void {
			this.store = {};
		},
		getItem(key: string): string | null {
			return this.store[key] ?? null;
		},
		setItem(key: string, value: string): void {
			this.store[key] = value;
		},
		removeItem(key: string): void {
			delete this.store[key];
		},
		get length(): number {
			return Object.keys(this.store).length;
		},
		key(): null {
			return null;
		}
	};

	// matchMedia stub — matches @uis/testing-bdd mock
	const matchMediaStub = (query: string): Record<string, unknown> => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: noop,
		removeListener: noop,
		addEventListener: noop,
		removeEventListener: noop,
		dispatchEvent: noop
	});

	// Minimal Element prototype for scrollIntoView etc.
	class HTMLElementStub {
		scrollIntoView = noop;
		getBoundingClientRect = (): Record<string, number> => ({
			top: 0,
			left: 0,
			bottom: 0,
			right: 0,
			width: 0,
			height: 0,
			x: 0,
			y: 0
		});
	}
	class ElementStub extends HTMLElementStub {}

	// Minimal XMLSerializer stub
	class XMLSerializerStub {
		serializeToString(): string {
			return '';
		}
	}

	// Build the window shim
	const windowShim: Record<string, unknown> = {};
	for (const key of Object.getOwnPropertyNames(globalThis)) {
		try {
			(windowShim as Record<string, unknown>)[key] = (globalThis as Record<string, unknown>)[key];
		} catch {
			// skip non-readable properties
		}
	}

	windowShim.location = locationStub;
	windowShim.document = documentStub;
	windowShim.navigator = navigatorStub;
	windowShim.localStorage = localStorageStub;
	windowShim.self = windowShim;
	windowShim.top = windowShim;
	windowShim.parent = windowShim;
	windowShim.addEventListener = noop;
	windowShim.removeEventListener = noop;
	windowShim.dispatchEvent = noop;
	windowShim.requestAnimationFrame = noop;
	windowShim.cancelAnimationFrame = noop;
	windowShim.getComputedStyle = () => noopObj;
	windowShim.matchMedia = matchMediaStub;
	windowShim.open = noop;
	windowShim.close = noop;
	windowShim.focus = noop;
	windowShim.blur = noop;
	windowShim.scroll = noop;
	windowShim.scrollTo = noop;
	windowShim.scrollBy = noop;
	windowShim.CustomEvent = class CustomEvent extends Event {};
	windowShim.HTMLElement = HTMLElementStub;
	windowShim.Element = ElementStub;
	windowShim.XMLSerializer = XMLSerializerStub;

	// Set globals on globalThis
	safeDefine(globalThis, 'window', windowShim);
	safeDefine(globalThis, 'document', documentStub);
	safeDefine(globalThis, 'navigator', navigatorStub);
	safeDefine(globalThis, 'location', locationStub);
	safeDefine(globalThis, 'localStorage', localStorageStub);
	safeDefine(globalThis, 'self', windowShim);
	safeDefine(globalThis, 'matchMedia', matchMediaStub);
	safeDefine(globalThis, 'XMLSerializer', XMLSerializerStub);
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
	/** Per-file errors that were caught but did not kill the worker */
	fileErrors?: string[];
}

async function processMessage(message: LoaderWorkerRequest): Promise<void> {
	if (message.type !== 'LOAD') {
		return;
	}

	const fileErrors: string[] = [];

	try {
		// Set the experimental decorators flag before loading support code
		global.experimentalDecorators = message.experimentalDecorators;
		process.env.CUCUMBER_EXPERIMENTAL_DECORATORS = String(message.experimentalDecorators);

		// Load require modules (transpiler setup) — these are critical, fail fast
		for (const modulePath of message.requireModules) {
			require(modulePath);
		}

		// Register ESM loaders — also critical for import phase
		for (const specifier of message.loaders) {
			register(specifier, pathToFileURL('./'));
		}

		// Load support files via require (CJS) — per-file isolation
		for (const filePath of message.requirePaths) {
			try {
				require(filePath);
			} catch (err: any) {
				fileErrors.push(`CJS ${filePath}: ${err.message || String(err)}`);
			}
		}

		// Load support files via import (ESM) — per-file isolation
		for (const filePath of message.importPaths) {
			try {
				await import(pathToFileURL(filePath).toString());
			} catch (err: any) {
				fileErrors.push(`ESM ${filePath}: ${err.message || String(err)}`);
			}
		}

		// Extract descriptors from the binding registry
		const { BindingRegistry } = require('../bindings/binding-registry');
		const registry = BindingRegistry.instance;
		const descriptors = registry.toDescriptors();
		const loadedFiles: string[] = Array.from(registry.getDescriptorSourceFiles());

		const response: LoaderWorkerResponse = {
			type: 'LOADED',
			descriptors,
			loadedFiles,
			fileErrors: fileErrors.length > 0 ? fileErrors : undefined
		};
		parentPort!.postMessage(response);
	} catch (err: any) {
		// Critical failure (transpiler setup / loader registration / registry extraction)
		const response: LoaderWorkerResponse = {
			type: 'ERROR',
			error: err.message || String(err),
			fileErrors: fileErrors.length > 0 ? fileErrors : undefined
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
