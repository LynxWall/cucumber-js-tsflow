/**
 * Which project modules a support file pulls in, and how a resident process makes them load again.
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
 * Watch mode (see `api/support-reloader.ts`) keeps one process alive across runs and needs the modules it
 * decides to re-evaluate to load again on the next `require`/`import`, with everything else served from the
 * caches Node already holds. The same two graphs give the reverse direction, `dependentProjectModules()`,
 * and the mechanics differ by module system:
 *
 * - CommonJS modules are deleted from `require.cache` (`evictRequiredModules()`); the next `require()`
 *   reads, transpiles and evaluates the file again.
 * - ES modules cannot be removed from Node's module map, so a module to re-evaluate is given a version
 *   (`bumpModuleVersions()`), and `versionedUrl()` appends it as a `?tsflow=<n>` query to the module's URL:
 *   the `resolve` hook applies it to every resolution it returns and `getSupportCodeLibrary` to the URLs it
 *   imports, so the next import of that file is a URL Node has never seen and evaluates afresh, while every
 *   unversioned module resolves to the instance already in the map. The previous instance stays in the map
 *   unreachable, which is the price of not restarting.
 *
 * Only project modules are kept: anything under a `node_modules` directory or inside this library's own
 * package is left out, since dependencies are versioned and the library's version is part of the index key.
 */
import path from 'node:path';
import { canonicalFromUrl, canonicalPath } from './paths';

/** Recorded ESM import edges, parent to children, both as canonical paths. */
const importEdges = new Map<string, Set<string>>();

/** Version of every ES module a resident process has decided to re-evaluate, by canonical path. */
const moduleVersions = new Map<string, number>();

/** Called by `notifyReload()`; the ESM loader registers its resolution-cache reset here. */
const reloadListeners = new Set<() => void>();

/** Query key `versionedUrl()` appends. */
const VERSION_QUERY = 'tsflow';

/** A loaded CommonJS module as `require.cache` holds it. */
type CachedModule = NonNullable<(typeof require.cache)[string]>;

/** This package's root (`lib/utils` is two levels down); its own modules are never project modules. */
const LIBRARY_ROOT = canonicalPath(path.join(__dirname, '..', '..'));

/** `url` without its query string and fragment. */
export function withoutQuery(url: string): string {
	const end = url.search(/[?#]/);
	return end === -1 ? url : url.slice(0, end);
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

/** Every project module in `require.cache`, with the key it is cached under. */
function cachedProjectModules(): Array<{ key: string; canonical: string; module: CachedModule }> {
	const result: Array<{ key: string; canonical: string; module: CachedModule }> = [];
	for (const key of Object.keys(require.cache)) {
		const module = require.cache[key];
		if (!module) continue;
		const canonical = canonicalPath(module.filename ?? key);
		if (isProjectModule(canonical)) result.push({ key, canonical, module });
	}
	return result;
}

/**
 * Every project module that imports or requires one of `changed`, directly or through other project
 * modules, in either module system. Canonical paths; the members of `changed` themselves are not included.
 * A cached module that depends on a changed one keeps the old instance until it is evaluated again, so a
 * resident process re-evaluates this whole set together with the changed files.
 */
export function dependentProjectModules(changed: Iterable<string>): Set<string> {
	const affected = new Set<string>(changed);
	const dependents = new Set<string>();

	// ESM: invert the recorded edges once, then close over them
	const parentsOf = new Map<string, Set<string>>();
	for (const [parent, children] of importEdges) {
		for (const child of children) {
			let parents = parentsOf.get(child);
			if (!parents) {
				parents = new Set<string>();
				parentsOf.set(child, parents);
			}
			parents.add(parent);
		}
	}
	const queue = Array.from(affected);
	for (let i = 0; i < queue.length; i++) {
		for (const parent of parentsOf.get(queue[i]) ?? []) {
			if (!affected.has(parent)) {
				affected.add(parent);
				dependents.add(parent);
				queue.push(parent);
			}
		}
	}

	// CommonJS: a parent lists its children, so iterate to a fixed point
	const cached = cachedProjectModules();
	let found = true;
	while (found) {
		found = false;
		for (const { canonical, module } of cached) {
			if (affected.has(canonical)) continue;
			if (module.children?.some(child => affected.has(canonicalPath(child.filename ?? child.id)))) {
				affected.add(canonical);
				dependents.add(canonical);
				found = true;
			}
		}
	}
	return dependents;
}

/** Every project module this process has loaded so far, in either module system. Canonical paths. */
export function knownProjectModules(): Set<string> {
	const known = new Set<string>();
	for (const [parent, children] of importEdges) {
		known.add(parent);
		for (const child of children) known.add(child);
	}
	for (const { canonical } of cachedProjectModules()) known.add(canonical);
	return known;
}

/** Delete the CommonJS modules at `files` (canonical paths) from `require.cache`, so their next `require()` evaluates them again. */
export function evictRequiredModules(files: ReadonlySet<string>): number {
	let evicted = 0;
	for (const key of Object.keys(require.cache)) {
		const module = require.cache[key];
		if (files.has(canonicalPath(module?.filename ?? key))) {
			delete require.cache[key];
			evicted++;
		}
	}
	return evicted;
}

/**
 * Give the ES modules at `files` (canonical paths) version `generation`, so that `versionedUrl()` maps them
 * to URLs Node has not loaded yet. Their recorded outgoing imports are forgotten too; the re-evaluation
 * records them again, so an import the file no longer has does not linger in its graph.
 */
export function bumpModuleVersions(files: Iterable<string>, generation: number): void {
	for (const file of files) {
		moduleVersions.set(file, generation);
		importEdges.delete(file);
	}
}

/**
 * The URL to load `url` under: for a `file:` URL of a module `bumpModuleVersions()` has versioned, the same
 * URL with `?tsflow=<version>`; any other URL unchanged. A query the URL already carries is kept unless it is
 * a previous version.
 */
export function versionedUrl(url: string): string {
	if (moduleVersions.size === 0 || !url.startsWith('file:')) return url;
	const plain = withoutQuery(url);
	const query = url.slice(plain.length);
	if (query && !query.startsWith(`?${VERSION_QUERY}=`)) return url;
	const canonical = canonicalFromUrl(plain);
	const version = canonical === undefined ? undefined : moduleVersions.get(canonical);
	return version === undefined ? plain : `${plain}?${VERSION_QUERY}=${version}`;
}

/** Register `listener` to run on every `notifyReload()`; returns a function that unregisters it. */
export function addReloadListener(listener: () => void): () => void {
	reloadListeners.add(listener);
	return () => reloadListeners.delete(listener);
}

/**
 * Tell every reload listener that the source tree may have changed since the last run. The ESM loader
 * drops its resolution caches here (files may have been added, removed or moved), which a one-shot run
 * never needs.
 */
export function notifyReload(): void {
	for (const listener of reloadListeners) listener();
}
