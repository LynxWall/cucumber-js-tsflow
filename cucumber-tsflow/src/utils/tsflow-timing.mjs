/**
 * Startup timing instrumentation for cucumber-tsflow (ESM version, used by the loader hooks).
 *
 * Enable with: TSFLOW_TIMING=true
 *
 * This is the twin of tsflow-timing.ts for code that runs on the ESM loader hooks thread.
 * It shares the per-thread store on `globalThis.__TSFLOW_TIMING` with the CJS build, records phases
 * and per-file timings, and answers snapshot
 * requests from the registering thread over the `MessagePort` delivered to `initialize()`.
 *
 * Usage:
 *   import { startTimer, recordFile } from '../../utils/tsflow-timing.mjs';
 *   const start = startTimer();
 *   ...
 *   recordFile('load', url, start);
 */

const SNAPSHOT_REQUEST = 'tsflow-timing:request';
const SNAPSHOT_RESPONSE = 'tsflow-timing:snapshot';

function getStore() {
	if (!globalThis.__TSFLOW_TIMING) {
		globalThis.__TSFLOW_TIMING = {
			enabled: process.env.TSFLOW_TIMING === 'true',
			phases: new Map(),
			files: [],
			remote: [],
			ports: []
		};
	}
	return globalThis.__TSFLOW_TIMING;
}

/**
 * Check if timing instrumentation is enabled
 */
export function isTimingEnabled() {
	return getStore().enabled;
}

/**
 * Start a timer. Returns 0 when timing is disabled so that the matching
 * `recordPhase` / `recordFile` call is a no-op.
 */
export function startTimer() {
	return getStore().enabled ? performance.now() : 0;
}

/**
 * Add the elapsed time since `start` to the named phase.
 * @param {string} name
 * @param {number} start
 */
export function recordPhase(name, start) {
	const store = getStore();
	if (!store.enabled) return;
	const ms = performance.now() - start;
	const existing = store.phases.get(name);
	if (existing) {
		existing.ms += ms;
		existing.count++;
	} else {
		store.phases.set(name, { name, ms, count: 1 });
	}
}

/**
 * Record the elapsed time since `start` against a file.
 * @param {'transpile'|'load'|'require'|'import'} kind
 * @param {string} file - path or file:// URL
 * @param {number} start
 */
export function recordFile(kind, file, start) {
	const store = getStore();
	if (!store.enabled) return;
	store.files.push({ kind, file, ms: performance.now() - start });
}

/**
 * Export this thread's timings. Returns undefined when timing is disabled.
 */
export function getTimingSnapshot() {
	const store = getStore();
	if (!store.enabled) return undefined;
	return {
		phases: Array.from(store.phases.values()),
		files: store.files.slice(),
		remote: store.remote.slice()
	};
}

/**
 * ESM loader `initialize` hook. Receives the `data` passed to `module.register()`; when the
 * registering thread supplied a timing port, enable timing on this thread and answer snapshot
 * requests on it. Each answered request drains the store so repeated collection is additive.
 *
 * Re-export this from a loader module: `export { initialize } from '../../utils/tsflow-timing.mjs';`
 */
export function initialize(data) {
	const port = data?.tsflowTimingPort;
	if (!port) return;

	const store = getStore();
	store.enabled = true;
	store.ports.push(port);

	port.on('message', msg => {
		if (msg?.type !== SNAPSHOT_REQUEST) return;
		port.postMessage({ type: SNAPSHOT_RESPONSE, snapshot: getTimingSnapshot() });
		store.phases.clear();
		store.files.length = 0;
		store.remote.length = 0;
	});
	port.unref();
}
