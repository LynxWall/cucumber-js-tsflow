import { initialize as initializeTiming } from '../../utils/tsflow-timing.mjs';

/**
 * Relays the source maps an esbuild loader records to the thread that registered it.
 *
 * `loadTypeScript()` in `loader-utils.mjs` keeps each transpiled module's map on
 * `globalThis.__CUCUMBER_TSFLOW_SOURCE_MAPS`, keyed by module URL, so that `Callsite.resolve()` in
 * `utils/our-callsite.ts` can report a step definition's TypeScript line. Under `module.registerHooks()` the
 * hooks run in-thread and that global is the one the resolver reads. Under `module.register()` they run on
 * Node's loader hooks thread, whose globals the main thread never sees; `registerLoader()` in
 * `api/register-loaders.ts` then passes a `MessagePort` as `data`, and the loader wrapped here posts each
 * module's map on it as soon as the module has loaded. The main thread drains the port on its first lookup
 * miss (`utils/loader-source-maps.ts`). Without a port, which is the in-thread case, the wrapper is a
 * pass-through.
 */

/** The port handed over in `initialize`; undefined in-thread, where no `initialize` hook runs. */
let sourceMapPort;

/**
 * ESM loader `initialize` hook for the esbuild loaders: takes the source-map relay port from `data`, and
 * hands `data` on to the timing hook so `TSFLOW_TIMING` keeps working under `module.register()`.
 *
 * Re-export this from a loader module: `export { initialize } from './source-map-relay.mjs';`
 */
export function initialize(data) {
	initializeTiming(data);
	const port = data?.tsflowSourceMapPort;
	if (!port) return;
	sourceMapPort = port;
	port.unref();
}

/**
 * Wrap a loader's `load` hook so that, when a relay port was received, the map recorded for each loaded
 * module is posted on it. A `load` that delegated to `nextLoad` returns a promise on the hooks thread and
 * recorded nothing, so only a synchronous result is followed by a lookup.
 */
export function relaySourceMaps(loader) {
	return {
		resolve: loader.resolve,
		load: (url, context, nextLoad) => {
			const result = loader.load(url, context, nextLoad);
			if (sourceMapPort && typeof result?.then !== 'function') {
				const sourceMap = globalThis.__CUCUMBER_TSFLOW_SOURCE_MAPS?.get(url);
				if (sourceMap) sourceMapPort.postMessage({ url, sourceMap });
			}
			return result;
		}
	};
}
