/**
 * The spellings of a file path, and how this library normalizes them.
 *
 * One file reaches the library under several names: the glob results and `require.cache` keys are native
 * paths, on Windows with a drive letter whose case varies; the ESM hooks see `file:` URLs, in watch mode
 * with a `?tsflow=<n>` version query; ts-node and source maps produce forward-slash paths; and a V8 stack
 * frame names an ES module by URL and a CommonJS module by path. Everything that keys a map by file
 * (`module-graph.ts`, `selective-load.ts`, `support-reloader.ts`, the timing report) uses the canonical form
 * from here, so two spellings of one file always land on one entry, and everything that shows a file to the
 * user or matches a path against a pattern uses the display helpers.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * An absolute, normalized form of `file` that is equal for two spellings of the same file: resolved against
 * the working directory, and lowercased on Windows, whose filesystem is case-insensitive.
 */
export function canonicalPath(file: string): string {
	const resolved = path.resolve(file);
	return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** The canonical path of a `file:` URL (its query and fragment ignored), or undefined for any other URL. */
export function canonicalFromUrl(url: string): string | undefined {
	if (!url.startsWith('file:')) return undefined;
	try {
		return canonicalPath(fileURLToPath(url));
	} catch {
		return undefined;
	}
}

/** The canonical path of a module as V8 names it in a stack frame: a `file:` URL for an ES module, a path otherwise. */
export function canonicalFromFrameFile(file: string): string | undefined {
	if (file.startsWith('file:')) return canonicalFromUrl(file);
	return path.isAbsolute(file) ? canonicalPath(file) : undefined;
}

/** `file` with forward slashes, for matching against a pattern or use as an import specifier. */
export function toPosixPath(file: string): string {
	return file.replace(/\\/g, '/');
}

/**
 * An absolute `file` made relative to the working directory when it lies beneath it; anything else (a
 * relative path, the working directory itself, a file outside it or on another drive) is returned as given.
 */
export function relativeToCwd(file: string): string {
	if (!path.isAbsolute(file)) return file;
	const relative = path.relative(process.cwd(), file);
	if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
		return file;
	}
	return relative;
}
