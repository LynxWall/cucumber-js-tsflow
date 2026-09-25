import { describe, it } from 'node:test';
import { expect } from 'chai';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import cache from '../../lib/transpilers/transpile-cache.js';
import { temporaryDirectory } from '../helpers/temp.ts';

const {
	withTranspileCache,
	getTranspileCacheStats,
	resetTranspileCacheStats,
	getCacheRootDirectory,
	getTranspileCacheDirectory,
	resetTranspileCacheDirectory,
	pruneTranspileCache,
	isTranspileCacheEnabled
} = cache;

const root = temporaryDirectory('transpile-cache');
const store = path.join(root, 'store');

/** Point the cache at `directory`, enabled, with zeroed counters. */
function useStore(directory: string): void {
	process.env.TSFLOW_TRANSPILE_CACHE_DIR = directory;
	delete process.env.TSFLOW_TRANSPILE_CACHE;
	resetTranspileCacheDirectory();
	resetTranspileCacheStats();
}

interface Inputs {
	kind?: string;
	file?: string;
	source?: string;
	configuration?: string;
}

/** One lookup; the value tells the inputs apart, and `produced` says whether the transpiler stand-in ran. */
function lookup({ kind = 'k', file = '/p/a.ts', source = 'const a = 1;', configuration = 'c' }: Inputs = {}) {
	let produced = false;
	const value = withTranspileCache(kind, file, source, configuration, () => {
		produced = true;
		return { output: `${kind}|${file}|${source}|${configuration}` };
	});
	return { value, produced };
}

function entries(directory = store): string[] {
	return readdirSync(directory)
		.filter(name => name.endsWith('.json'))
		.sort();
}

describe('withTranspileCache', () => {
	it('runs produce on a miss, stores the result, and answers the next identical lookup from disk', () => {
		useStore(store);
		const first = lookup();
		expect(first.produced).to.equal(true);
		expect(entries()).to.have.length(1);
		const second = lookup();
		expect(second.produced).to.equal(false);
		expect(second.value).to.deep.equal(first.value);
		expect(getTranspileCacheStats()).to.deep.equal({ hits: 1, misses: 1, writes: 1 });
	});

	it('misses when any one input changes, and still finds the original', () => {
		useStore(store);
		expect(lookup().produced, 'written by the previous test').to.equal(false);
		expect(lookup({ kind: 'other' }).produced).to.equal(true);
		expect(lookup({ file: '/p/b.ts' }).produced).to.equal(true);
		expect(lookup({ source: 'const a = 2;' }).produced).to.equal(true);
		expect(lookup({ configuration: 'c2' }).produced).to.equal(true);
		expect(lookup().produced).to.equal(false);
		expect(getTranspileCacheStats()).to.include({ hits: 2, misses: 4 });
	});

	it('keeps the inputs apart in the key', () => {
		useStore(store);
		lookup({ kind: 'ab', configuration: 'c' });
		expect(lookup({ kind: 'a', configuration: 'bc' }).produced).to.equal(true);
		lookup({ configuration: 'x', file: '/p/y.ts' });
		expect(lookup({ configuration: 'x/p/y.ts', file: '' }).produced).to.equal(true);
	});

	it('replaces an entry of another format, an unparseable entry and an entry without a value', () => {
		useStore(store);
		const before = new Set(entries());
		lookup({ source: 'fresh' });
		const [name] = entries().filter(entry => !before.has(entry));
		const file = path.join(store, name);
		for (const bad of ['{"v":99,"value":{"x":1}}', 'not json at all', '{"v":1,"value":null}', '{"v":1}']) {
			writeFileSync(file, bad);
			expect(lookup({ source: 'fresh' }).produced, bad).to.equal(true);
			expect(JSON.parse(readFileSync(file, 'utf8'))).to.deep.equal({ v: 1, value: { output: 'k|/p/a.ts|fresh|c' } });
		}
	});

	it('returns the produced result when the entry cannot be written, and misses again next time', () => {
		const blocker = path.join(root, 'not-a-directory');
		writeFileSync(blocker, '');
		useStore(path.join(blocker, 'store'));
		expect(lookup().produced).to.equal(true);
		expect(lookup().produced).to.equal(true);
		expect(getTranspileCacheStats()).to.include({ writes: 0, misses: 2, hits: 0 });
	});

	it('is exactly produce() under TSFLOW_TRANSPILE_CACHE=false: nothing read, counted or written', () => {
		useStore(store);
		lookup({ source: 'cached earlier' });
		const count = entries().length;
		process.env.TSFLOW_TRANSPILE_CACHE = 'false';
		resetTranspileCacheStats();
		expect(isTranspileCacheEnabled()).to.equal(false);
		expect(lookup({ source: 'cached earlier' }).produced).to.equal(true);
		expect(lookup({ source: 'never written' }).produced).to.equal(true);
		expect(entries()).to.have.length(count);
		expect(getTranspileCacheStats()).to.deep.equal({ hits: 0, misses: 0, writes: 0 });
		delete process.env.TSFLOW_TRANSPILE_CACHE;
		expect(isTranspileCacheEnabled()).to.equal(true);
		expect(lookup({ source: 'cached earlier' }).produced).to.equal(false);
	});

	it('zeroes the counters on resetTranspileCacheStats', () => {
		useStore(store);
		lookup({ source: 'counted' });
		lookup({ source: 'counted' });
		resetTranspileCacheStats();
		expect(getTranspileCacheStats()).to.include({ hits: 0, misses: 0, writes: 0 });
	});
});

describe('pruneTranspileCache', () => {
	it('does nothing unless this thread wrote an entry', () => {
		const directory = path.join(root, 'prune-warm');
		useStore(directory);
		lookup();
		resetTranspileCacheStats();
		pruneTranspileCache(0);
		expect(entries(directory)).to.have.length(1);
	});

	it('deletes the least recently written files first, stray temp files included, until the directory fits', () => {
		const directory = path.join(root, 'prune');
		useStore(directory);
		lookup({ source: 'one' });
		lookup({ source: 'two' });
		lookup({ source: 'three' });
		const files = readdirSync(directory).map(name => path.join(directory, name));
		const stray = path.join(directory, 'abandoned.json.123-0.tmp');
		writeFileSync(stray, 'x'.repeat(10));
		const now = Date.now() / 1000;
		utimesSync(stray, now - 400, now - 400);
		files.forEach((file, i) => utimesSync(file, now - 300 + i * 100, now - 300 + i * 100));
		const total = [...files, stray].reduce((sum, file) => sum + statSync(file).size, 0);

		// Over by 11 bytes: the 10-byte stray goes first, then the oldest entry, and that is enough
		pruneTranspileCache(total - 11);
		expect(existsSync(stray)).to.equal(false);
		expect(existsSync(files[0])).to.equal(false);
		expect(existsSync(files[1])).to.equal(true);
		expect(existsSync(files[2])).to.equal(true);
	});

	it('leaves a directory that already fits alone', () => {
		const directory = path.join(root, 'prune-fits');
		useStore(directory);
		lookup({ source: 'one' });
		lookup({ source: 'two' });
		pruneTranspileCache(Number.MAX_SAFE_INTEGER);
		expect(entries(directory)).to.have.length(2);
	});
});

describe('cache directories', () => {
	it('lives under the nearest node_modules at or above the working directory', () => {
		const project = path.join(root, 'project');
		mkdirSync(path.join(project, 'node_modules'), { recursive: true });
		mkdirSync(path.join(project, 'src', 'deep'), { recursive: true });
		resetTranspileCacheDirectory();
		expect(getCacheRootDirectory(path.join(project, 'src', 'deep'))).to.equal(
			path.join(project, 'node_modules', '.cache', 'cucumber-tsflow')
		);
	});

	it('falls back to the nearest package.json when there is no node_modules above', () => {
		const project = path.join(root, 'package-only');
		mkdirSync(path.join(project, 'src'), { recursive: true });
		writeFileSync(path.join(project, 'package.json'), '{}');
		expect(getCacheRootDirectory(path.join(project, 'src'))).to.equal(
			path.join(project, 'node_modules', '.cache', 'cucumber-tsflow')
		);
	});

	it('falls back to the OS temp directory when there is neither', () => {
		const bare = path.join(root, 'bare');
		mkdirSync(bare);
		expect(getCacheRootDirectory(bare)).to.equal(path.join(tmpdir(), 'cucumber-tsflow'));
	});

	it('remembers the answer per working directory until reset', () => {
		const bare = path.join(root, 'bare');
		const before = getCacheRootDirectory(bare);
		mkdirSync(path.join(bare, 'node_modules'));
		expect(getCacheRootDirectory(bare)).to.equal(before);
		resetTranspileCacheDirectory();
		expect(getCacheRootDirectory(bare)).to.equal(path.join(bare, 'node_modules', '.cache', 'cucumber-tsflow'));
	});

	it('honors TSFLOW_TRANSPILE_CACHE_DIR, resolved, and otherwise uses transpile under the cache root', () => {
		useStore('relative/store');
		expect(getTranspileCacheDirectory()).to.equal(path.resolve('relative/store'));
		delete process.env.TSFLOW_TRANSPILE_CACHE_DIR;
		resetTranspileCacheDirectory();
		expect(getTranspileCacheDirectory()).to.equal(path.join(getCacheRootDirectory(), 'transpile'));
	});
});
