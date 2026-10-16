/**
 * Source maps of the modules the esbuild ESM loaders transpiled, for `Callsite.resolve()` in `our-callsite.ts`.
 *
 * `loadTypeScript()` in `transpilers/esm/loader-utils.mjs` records each module's map on
 * `globalThis.__CUCUMBER_TSFLOW_SOURCE_MAPS`, keyed by module URL, on the thread that ran the `load` hook.
 * With the hooks attached in-thread (`module.registerHooks()`) that is this thread and the map is read
 * directly. Under `module.register()` the hooks run on Node's loader hooks thread, whose globals this
 * thread never sees, so `registerLoader()` hands the loader a `MessagePort` and the loader relays every
 * map it records over it (`transpilers/esm/source-map-relay.mjs`). The relayed maps are drained into the
 * same global here, synchronously, the first time a lookup misses. A loader posts a module's map before it
 * returns the module's source, and callsites are resolved after the support code has loaded, so by then
 * every map is waiting in the port's queue.
 */
import { MessageChannel, MessagePort, receiveMessageOnPort } from 'node:worker_threads';

/** The `data` a relaying loader receives in its `initialize` hook. */
export interface SourceMapRelayData {
	tsflowSourceMapPort: MessagePort;
}

/** One relayed map: the module URL as the `load` hook received it and the map's JSON text. */
export interface SourceMapMessage {
	url: string;
	sourceMap: string;
}

/** The receiving ends of the ports handed to loaders registered with `module.register()` on this thread. */
const ports: MessagePort[] = [];

/**
 * Options to spread into `module.register()` so the loader's `initialize` hook receives a `MessagePort` on
 * which to relay source maps back to this thread. The receiving end is kept here and never keeps the
 * process alive.
 */
export function sourceMapRegisterOptions(): { data: SourceMapRelayData; transferList: MessagePort[] } {
	const { port1, port2 } = new MessageChannel();
	port1.unref();
	ports.push(port1);
	return { data: { tsflowSourceMapPort: port2 }, transferList: [port2] };
}

/**
 * The source map of the module at `url`, as recorded by an esbuild loader on this thread or relayed from
 * the hooks thread; undefined when the module was not transpiled by one of those loaders.
 */
export function loaderSourceMap(url: string): string | undefined {
	const store = (globalThis.__CUCUMBER_TSFLOW_SOURCE_MAPS ??= new Map<string, string>());
	let sourceMap = store.get(url);
	if (sourceMap === undefined && ports.length > 0) {
		drainRelayedMaps(store);
		sourceMap = store.get(url);
	}
	return sourceMap;
}

/** Move every map waiting on a relay port into `store`. */
function drainRelayedMaps(store: Map<string, string>): void {
	for (const port of ports) {
		let received = receiveMessageOnPort(port);
		while (received !== undefined) {
			const { url, sourceMap } = received.message as SourceMapMessage;
			store.set(url, sourceMap);
			received = receiveMessageOnPort(port);
		}
	}
}
