/**
 * Which project modules a support file pulls in.
 *
 * Selective loading (see `api/selective-load.ts`) skips support files whose step definitions the selected
 * scenarios do not use, and it may only do so while the information it recorded about a skipped file is
 * still true. A file's step patterns can come from any module it imports, so the record covers the whole
 * import graph beneath the file, and this module is where that graph is observed:
 *
 * - CommonJS: Node keeps the graph itself. Every `require()`, cached or not, adds the child to the parent's
 *   `module.children`, so `requiredProjectModules()` walks `require.cache` from the entry.
 * - ES modules: Node exposes no graph, but the esbuild ESM loaders' `resolve` hook sees every import site
 *   with its `parentURL` (in-thread, under `module.registerHooks()`), and calls `recordImportEdge()` for
 *   each. `importedProjectModules()` then walks the recorded edges from the entry. Under `module.register()`
 *   the hook runs on another thread and nothing is recorded here, which is why selective loading is
 *   unavailable for loaders that use it.
 *
 * Only project modules are kept: anything under a `node_modules` directory or inside this library's own
 * package is left out, since dependencies are versioned and the library's version is part of the index key.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Recorded ESM import edges, parent to children, both as canonical paths. */
const importEdges = new Map<string, Set<string>>();

/** A loaded CommonJS module as `require.cache` holds it. */
type CachedModule = NonNullable<(typeof require.cache)[string]>;

/** This package's root (`lib/utils` is two levels down); its own modules are never project modules. */
const LIBRARY_ROOT = canonicalPath(path.join(__dirname, '..', '..'));

/**
 * An absolute, normalised form of `file` that is equal for two spellings of the same file: on Windows the
 * drive letter and path case vary between the glob results, `require.cache` keys and `file:` URLs.
 */
export function canonicalPath(file: string): string {
	const resolved = path.resolve(file);
	return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function canonicalFromUrl(url: string): string | undefined {
	if (!url.startsWith('file:')) return undefined;
	try {
		return canonicalPath(fileURLToPath(url));
	} catch {
		return undefined;
	}
}

/** Whether a canonical path belongs to the project under test rather than to a dependency or this library. */
export function isProjectModule(file: string): boolean {
	if (file.split(/[\\/]/).includes('node_modules')) return false;
	return !(file === LIBRARY_ROOT || file.startsWith(LIBRARY_ROOT + path.sep));
}

/**
 * Record that the module at `parentURL` imports the module at `url`. Called by the ESM `resolve` hook with
 * whatever it is about to return; anything that is not a project file on either side is ignored.
 */
export function recordImportEdge(parentURL: string | undefined, url: string): void {
	if (!parentURL) return;
	const child = canonicalFromUrl(url);
	if (!child || !isProjectModule(child)) return;
	const parent = canonicalFromUrl(parentURL);
	if (!parent || !isProjectModule(parent)) return;
	let children = importEdges.get(parent);
	if (!children) {
		children = new Set<string>();
		importEdges.set(parent, children);
	}
	children.add(child);
}

/** Every project module reachable from `entry` through recorded ESM imports, `entry` first. Canonical paths. */
export function importedProjectModules(entry: string): string[] {
	const start = canonicalPath(entry);
	const seen = new Set<string>([start]);
	const queue = [start];
	for (let i = 0; i < queue.length; i++) {
		for (const child of importEdges.get(queue[i]) ?? []) {
			if (!seen.has(child)) {
				seen.add(child);
				queue.push(child);
			}
		}
	}
	return Array.from(seen);
}

/** Every project module reachable from `entry` through Node's CommonJS module cache, `entry` first. Canonical paths. */
export function requiredProjectModules(entry: string): string[] {
	const start = canonicalPath(entry);
	let root: CachedModule | undefined;
	try {
		root = require.cache[require.resolve(path.resolve(entry))];
	} catch {
		root = undefined;
	}
	const seen = new Set<string>([start]);
	if (!root) return Array.from(seen);
	const queue: CachedModule[] = [root];
	for (let i = 0; i < queue.length; i++) {
		for (const child of queue[i].children ?? []) {
			const key = canonicalPath(child.filename ?? child.id);
			if (seen.has(key) || !isProjectModule(key)) continue;
			seen.add(key);
			queue.push(child);
		}
	}
	return Array.from(seen);
}
