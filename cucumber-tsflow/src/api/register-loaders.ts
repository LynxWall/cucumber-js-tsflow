import * as nodeModule from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startTimer, recordPhase, timingRegisterOptions } from '../utils/tsflow-timing';

/**
 * How a loader's hooks are attached to the current thread.
 *
 * - `sync`: `module.registerHooks()` (Node 22.15 / 23.5 and later). The loader module is imported into this
 *   thread and its `resolve`/`load` run synchronously in-thread, so there is no `postMessage` round trip per
 *   resolve and no structured clone of every transformed source. Only tsflow's own esbuild loaders qualify;
 *   their hooks were written to be synchronous.
 * - `async`: `module.register()`. Node evaluates the loader on a dedicated hooks thread. Used for the
 *   ts-node based loaders (whose hooks are asynchronous), for third-party loaders, on Node versions without
 *   `registerHooks`, and whenever `TSFLOW_ESM_HOOKS=async` is set.
 */
export type LoaderHooksMode = 'sync' | 'async';

interface SyncHooks {
	resolve?: unknown;
	load?: unknown;
}

// `module.registerHooks()` exists from Node 22.15 / 23.5; @types/node 22.13 does not declare it yet.
const registerHooks = (nodeModule as unknown as { registerHooks?: (hooks: SyncHooks) => unknown }).registerHooks;

/** Loaders under `lib/transpilers/esm` whose resolve/load hooks are synchronous and can run in-thread. */
const SYNC_CAPABLE_LOADERS = new Set(['esnode-loader', 'esvue-loader']);

/**
 * Loader files already attached to this thread with `registerHooks()`, and loader specifiers already
 * attached to the process with `register()`. Hooks stack, so registering the same loader twice (a
 * `loadSupport` / `reloadSupport` cycle, or a second run in watch mode) would add a redundant layer that
 * every later resolve and load would pass through.
 */
const registeredSync = new Set<string>();
const registeredAsync = new Set<string>();

function syncLoaderFile(specifier: string): string | undefined {
	const match = /\/transpilers\/esm\/([^/]+?)(\.mjs)?$/.exec(specifier.replace(/\\/g, '/'));
	if (!match || !SYNC_CAPABLE_LOADERS.has(match[1])) {
		return undefined;
	}
	// Import by path relative to this build rather than re-resolving the package specifier.
	return path.join(__dirname, '..', 'transpilers', 'esm', `${match[1]}.mjs`);
}

/**
 * The mechanism `registerLoader` will use for `specifier` on this Node version.
 */
export function loaderHooksMode(specifier: string): LoaderHooksMode {
	if (process.env.TSFLOW_ESM_HOOKS === 'async' || typeof registerHooks !== 'function') {
		return 'async';
	}
	return syncLoaderFile(specifier) ? 'sync' : 'async';
}

/**
 * Attach an ESM loader to the current thread, synchronously in-thread when the loader supports it and
 * `module.registerHooks()` is available, otherwise on Node's loader hooks thread via `module.register()`.
 * Returns the mechanism used.
 */
export async function registerLoader(specifier: string): Promise<LoaderHooksMode> {
	const file = loaderHooksMode(specifier) === 'sync' ? syncLoaderFile(specifier) : undefined;
	if (!file || !registerHooks) {
		if (!registeredAsync.has(specifier)) {
			nodeModule.register(specifier, pathToFileURL('./'), timingRegisterOptions());
			registeredAsync.add(specifier);
		}
		return 'async';
	}

	if (!registeredSync.has(file)) {
		const start = startTimer();
		const hooks: SyncHooks = await import(pathToFileURL(file).href);
		registerHooks({ resolve: hooks.resolve, load: hooks.load });
		registeredSync.add(file);
		recordPhase('esm:hooks-init', start);
	}
	return 'sync';
}
