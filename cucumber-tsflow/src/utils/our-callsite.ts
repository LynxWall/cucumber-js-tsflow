import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sourceMapSupport from 'source-map-support';
import { CallSite } from 'source-map-support';

/**
 * Frames on the stack when `capture()` takes it: `capture()` itself, the decorator factory that called it
 * (`given`, `before`, …) and the support file that applied the decorator. Only the last one is wanted.
 */
const CAPTURE_DEPTH = 3;

/** Decoded maps from `__CUCUMBER_TSFLOW_SOURCE_MAPS`, by module URL; `null` records a URL with no map. */
const traceMaps = new Map<string, TraceMap | null>();

/**
 * Map a position in a module the esbuild ESM loader transpiled on this thread back to its TypeScript
 * line. The loader keeps each module's source map on `__CUCUMBER_TSFLOW_SOURCE_MAPS` (see
 * `loadTypeScript()` in `transpilers/esm/loader-utils.mjs`) because the transpiled code exists only in
 * memory, so `source-map-support`, which reads the file on disk, cannot find a map for it. Returns
 * undefined when the module was not loaded that way or the position has no mapping, and the caller falls
 * back to `source-map-support`.
 *
 * @param url - The frame's file name, a `file:` URL for an ES module
 * @param line - 1-based line in the transpiled code
 * @param column - 1-based column in the transpiled code, as V8 reports it
 */
function traceLoaderMap(
	url: string,
	line: number,
	column: number
): { filename: string; lineNumber: number } | undefined {
	let map = traceMaps.get(url);
	if (map === undefined) {
		const raw = globalThis.__CUCUMBER_TSFLOW_SOURCE_MAPS?.get(url);
		map = raw ? new TraceMap(raw) : null;
		traceMaps.set(url, map);
	}
	if (!map) return undefined;
	const position = originalPositionFor(map, { line, column: Math.max(0, column - 1) });
	if (position.line === null) return undefined;
	// The map is for a single-file transform, so its only source is the module itself.
	return { filename: fileURLToPath(url), lineNumber: position.line };
}

/**
 * Runs `fn` with `source-map-support`'s browser detection defeated.
 *
 * The library decides it is running in a browser when `window` and `XMLHttpRequest` are globals — exactly
 * what a jsdom set-up creates — and then fetches every source file it sees with a synchronous
 * `XMLHttpRequest` before reading it from disk anyway. jsdom services a synchronous request by spawning a
 * process, so each support file costs hundreds of milliseconds. Removing the constructor for the duration
 * of the (synchronous) lookup keeps the library on its file-system path; nothing else can observe the gap.
 */
function withoutBrowserDetection<T>(fn: () => T): T {
	const globals = globalThis as { window?: unknown; XMLHttpRequest?: unknown };
	if (typeof globals.window === 'undefined' || typeof globals.XMLHttpRequest !== 'function') {
		return fn();
	}
	const descriptor = Object.getOwnPropertyDescriptor(globals, 'XMLHttpRequest');
	if (!descriptor?.configurable) {
		return fn();
	}
	delete globals.XMLHttpRequest;
	try {
		return fn();
	} finally {
		Object.defineProperty(globals, 'XMLHttpRequest', descriptor);
	}
}

/**
 * Represents a callsite of where a step binding is being applied.
 *
 * The raw V8 stack frame is taken when the decorator factory runs, which is once per binding while support
 * code loads. Mapping that frame through source maps is the expensive part (the first frame from a file
 * parses that file's source map), so it is deferred to the first read of `filename` or `lineNumber`. Those
 * reads happen after loading, when the registry back-patches the CucumberJS definitions or an error message
 * is built, and never while a support file is being evaluated.
 */
export class Callsite {
	private static readonly cwdPrefix = `${process.cwd()}${path.sep}`;
	private resolved?: { filename: string; lineNumber: number };

	private constructor(private readonly frame: CallSite | undefined) {}

	/**
	 * The filename of the callsite, mapped through source maps and made relative to the working directory
	 * when it lies beneath it.
	 */
	public get filename(): string {
		return this.resolve().filename;
	}

	/**
	 * The line number of the callsite, mapped through source maps.
	 */
	public get lineNumber(): number {
		return this.resolve().lineNumber;
	}

	/**
	 * The position of the callsite in the code V8 executed, before source mapping. Distinct decorator
	 * expressions always have distinct raw positions and reading it costs nothing, so the registry uses it
	 * as a binding's identity.
	 */
	public get rawPosition(): string {
		const frame = this.frame;
		if (!frame) {
			return '';
		}
		return `${frame.getFileName() ?? ''}:${frame.getLineNumber() ?? -1}:${frame.getColumnNumber() ?? -1}`;
	}

	/**
	 * Returns a string representation of the callsite.
	 *
	 * @returns A string representing the callsite formatted with the filename and line
	 * number.
	 */
	public toString(): string {
		return `${this.filename}:${this.lineNumber}`;
	}

	/**
	 * Captures the current [[Callsite]] object.
	 */
	public static capture(): Callsite {
		// Both are process-wide V8 hooks; save them so they can be restored unchanged.
		const previousLimit = Error.stackTraceLimit;
		const previousPrepare = Error.prepareStackTrace;
		// Record only the three frames of interest and return them as raw CallSite objects, not a formatted string.
		Error.stackTraceLimit = CAPTURE_DEPTH;
		Error.prepareStackTrace = (_, stack) => stack;
		// Creating the Error records the frames; reading `.stack` invokes the hook above. Nothing is thrown.
		const stack = new Error().stack as unknown as CallSite[] | undefined;
		// Restore before anything else can observe the changed hooks (no await between set and restore).
		Error.prepareStackTrace = previousPrepare;
		Error.stackTraceLimit = previousLimit;

		// Frame 0 is capture(), 1 the decorator factory, 2 the support file that applied the decorator.
		return new Callsite(stack?.[CAPTURE_DEPTH - 1]);
	}

	private resolve(): { filename: string; lineNumber: number } {
		if (!this.resolved) {
			const frame = this.frame;
			const url = frame?.getFileName();
			let traced =
				frame && url?.startsWith('file:')
					? traceLoaderMap(url, frame.getLineNumber() ?? 0, frame.getColumnNumber() ?? 0)
					: undefined;
			if (!traced) {
				const mapped = frame ? withoutBrowserDetection(() => sourceMapSupport.wrapCallSite(frame)) : undefined;
				traced = { filename: mapped?.getFileName() || '', lineNumber: mapped?.getLineNumber() || -1 };
			}
			let { filename } = traced;
			if (filename.startsWith(Callsite.cwdPrefix)) {
				filename = filename.slice(Callsite.cwdPrefix.length);
			}
			this.resolved = { filename, lineNumber: traced.lineNumber };
		}
		return this.resolved;
	}
}
