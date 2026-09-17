/**
 * Content-addressed on-disk cache for transpiler output.
 *
 * Every transpile a run performs (esbuild for `.ts`/`.tsx`, the Vue SFC compiler for `.vue`) is a pure
 * function of the file's source, the transpiler and its options, and the versions of the tools involved.
 * This module stores each result under a SHA-256 of exactly those inputs, so a later run with unchanged
 * sources reads the output back instead of transpiling, and the N+1 contexts of a `parallel` run (the
 * coordinator, every child process, every preload thread) share one cold transpile between them.
 *
 * Correctness rests on the key alone. A wrong key would not crash, it would run stale code, so the key
 * covers: the source text, the absolute file name (esbuild's source map names it and the Vue compiler
 * derives the component id from it), the caller's `kind`, the caller's serialised configuration
 * (transform options including `tsconfigRaw`, the tsconfig `paths` and `absoluteBaseUrl` that the ESM
 * loader bakes into its output as `file://` URLs, the Vue style flag, the decorator mode, the esbuild and
 * Vue compiler versions), and this library's version. Nothing is looked up by path or by mtime.
 *
 * Writes are best-effort and atomic (write to a temp file, `rename` over the entry) so concurrent
 * processes populating an empty cache can never leave a truncated entry or read one; the last writer of an
 * identical result wins. A read failure or unreadable entry is a miss. The cache never changes what a
 * transpile returns, only whether it ran.
 *
 * Location: `TSFLOW_TRANSPILE_CACHE_DIR` if set, otherwise `node_modules/.cache/cucumber-tsflow/transpile`
 * under the nearest `node_modules` directory at or above the working directory (or the nearest
 * `package.json`), falling back to the OS temp directory. `TSFLOW_TRANSPILE_CACHE=false` (the
 * `--no-transpile-cache` option) disables reads and writes. `pruneTranspileCache()` bounds the directory
 * by size, evicting the least recently written entries first; a content-addressed store's garbage is
 * exactly the entries no current source produces any more, and those are the oldest.
 */
import { createHash } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { threadId } from 'node:worker_threads';
import { version as tsflowVersion } from '../version';
import { startTimer, recordFile, recordPhase } from '../utils/tsflow-timing';

/** Bumped when the on-disk entry shape changes; part of every key, so old entries simply become garbage. */
const ENTRY_FORMAT = 1;

/** Default size bound for `pruneTranspileCache()`. */
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;

const ENTRY_EXTENSION = '.json';

interface EntryFile<T> {
	v: number;
	value: T;
}

export interface TranspileCacheStats {
	/** Whether this thread is reading and writing the cache. */
	enabled: boolean;
	/** The directory in use, once the first lookup has resolved it. */
	directory?: string;
	/** Lookups answered from disk in this thread. */
	hits: number;
	/** Lookups that ran the transpiler in this thread. */
	misses: number;
	/** Entries this thread wrote. */
	writes: number;
}

const stats = { hits: 0, misses: 0, writes: 0 };
let directory: string | undefined;
let directoryEnsured = false;

/**
 * True unless `TSFLOW_TRANSPILE_CACHE=false`, which `loadConfiguration` sets from the `transpileCache`
 * option (`--no-transpile-cache`). Read per call: the option is applied after this module may have loaded.
 */
export function isTranspileCacheEnabled(): boolean {
	return process.env.TSFLOW_TRANSPILE_CACHE !== 'false';
}

/** Counters for this thread; parallel children and preload threads keep their own. */
export function getTranspileCacheStats(): TranspileCacheStats {
	return { enabled: isTranspileCacheEnabled(), directory, ...stats };
}

/**
 * The cache directory: an explicit `TSFLOW_TRANSPILE_CACHE_DIR`, else `.cache/cucumber-tsflow/transpile`
 * inside the nearest `node_modules` at or above the working directory, else that path under the nearest
 * `package.json`'s directory, else the OS temp directory. Resolved once per thread.
 */
export function getTranspileCacheDirectory(): string {
	if (directory) return directory;
	const override = process.env.TSFLOW_TRANSPILE_CACHE_DIR;
	if (override) {
		directory = path.resolve(override);
		return directory;
	}
	const suffix = ['.cache', 'cucumber-tsflow', 'transpile'];
	let firstPackageRoot: string | undefined;
	let dir = process.cwd();
	for (;;) {
		if (existsSync(path.join(dir, 'node_modules'))) {
			directory = path.join(dir, 'node_modules', ...suffix);
			return directory;
		}
		if (!firstPackageRoot && existsSync(path.join(dir, 'package.json'))) firstPackageRoot = dir;
		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	directory = firstPackageRoot
		? path.join(firstPackageRoot, 'node_modules', ...suffix)
		: path.join(tmpdir(), 'cucumber-tsflow', 'transpile');
	return directory;
}

function entryPath(key: string): string {
	return path.join(getTranspileCacheDirectory(), key + ENTRY_EXTENSION);
}

/**
 * Return the cached result for `source` of `filename` under `kind` and `configuration`, or run `produce`,
 * store its result and return it. `configuration` must serialise every input other than the source and
 * file name that can change the output (options, tool versions); this library's version and the entry
 * format are added here. With the cache disabled this is exactly `produce()`.
 *
 * Timing: a hit records a `transpile` file entry for the lookup time, so file counts in the
 * `TSFLOW_TIMING` report stay comparable between cold and warm runs, and hits and misses appear as the
 * `transpile-cache:hit` / `transpile-cache:miss` phases, whose `calls` column is the hit and miss count.
 */
export function withTranspileCache<T extends object>(
	kind: string,
	filename: string,
	source: string,
	configuration: string,
	produce: () => T
): T {
	if (!isTranspileCacheEnabled()) return produce();

	const start = startTimer();
	const key = createHash('sha256')
		.update(`${ENTRY_FORMAT}\0${tsflowVersion}\0${kind}\0${configuration}\0${filename}\0`)
		.update(source)
		.digest('hex');

	const cached = readEntry<T>(key);
	if (cached !== undefined) {
		stats.hits++;
		recordFile('transpile', filename, start);
		recordPhase('transpile-cache:hit', start);
		return cached;
	}

	stats.misses++;
	const value = produce();
	writeEntry(key, value);
	recordPhase('transpile-cache:miss', start);
	return value;
}

function readEntry<T>(key: string): T | undefined {
	const file = entryPath(key);
	let text: string;
	try {
		text = readFileSync(file, 'utf8');
	} catch {
		return undefined;
	}
	try {
		const entry = JSON.parse(text) as EntryFile<T>;
		if (entry?.v === ENTRY_FORMAT && entry.value !== null && typeof entry.value === 'object') {
			return entry.value;
		}
	} catch {
		// Unparseable: drop it below and transpile
	}
	try {
		unlinkSync(file);
	} catch {
		// Another process may have replaced or removed it already
	}
	return undefined;
}

function writeEntry(key: string, value: object): void {
	const file = entryPath(key);
	const temp = `${file}.${process.pid}-${threadId}.tmp`;
	try {
		if (!directoryEnsured) {
			mkdirSync(getTranspileCacheDirectory(), { recursive: true });
			directoryEnsured = true;
		}
		const entry: EntryFile<object> = { v: ENTRY_FORMAT, value };
		writeFileSync(temp, JSON.stringify(entry));
		renameSync(temp, file);
		stats.writes++;
	} catch {
		// Best effort: a read-only location, a full disk, or (on Windows) a concurrent reader holding the
		// target open. The transpile result is still returned to the caller; the next run misses again.
		try {
			unlinkSync(temp);
		} catch {
			// The temp file was never created
		}
	}
}

/**
 * Bound the cache directory to `maxBytes`, deleting the least recently written entries (and any stray
 * temp files) until it fits. Does nothing unless this thread wrote an entry, so a warm run never scans the
 * directory; the main process calls it once after support code has loaded.
 */
export function pruneTranspileCache(maxBytes: number = DEFAULT_MAX_BYTES): void {
	if (stats.writes === 0 || !directory) return;
	const start = startTimer();
	try {
		const entries: Array<{ file: string; size: number; mtimeMs: number }> = [];
		let total = 0;
		for (const name of readdirSync(directory)) {
			const file = path.join(directory, name);
			try {
				const stat = statSync(file);
				if (!stat.isFile()) continue;
				entries.push({ file, size: stat.size, mtimeMs: stat.mtimeMs });
				total += stat.size;
			} catch {
				// Removed by another process between readdir and stat
			}
		}
		if (total <= maxBytes) return;
		entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
		for (const entry of entries) {
			if (total <= maxBytes) break;
			try {
				unlinkSync(entry.file);
				total -= entry.size;
			} catch {
				// In use or already gone; skip it
			}
		}
	} catch {
		// The directory disappeared or cannot be listed; nothing to prune
	} finally {
		recordPhase('transpile-cache:prune', start);
	}
}
