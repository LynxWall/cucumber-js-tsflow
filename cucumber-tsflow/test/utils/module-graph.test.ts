import { describe, it } from 'node:test';
import { expect } from 'chai';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import moduleGraph from '../../lib/utils/module-graph.js';
import { temporaryDirectory } from '../helpers/temp.ts';

const {
	canonicalPath,
	canonicalFromUrl,
	canonicalFromFrameFile,
	withoutQuery,
	isProjectModule,
	recordImportEdge,
	importedProjectModules,
	requiredProjectModules,
	dependentProjectModules,
	knownProjectModules,
	evictRequiredModules,
	bumpModuleVersions,
	versionedUrl,
	addReloadListener,
	notifyReload
} = moduleGraph;

const require = createRequire(import.meta.url);
const windows = process.platform === 'win32';
const libraryRoot = path.resolve(import.meta.dirname, '..', '..');

describe('canonicalPath', () => {
	it('resolves a relative path against the working directory', () => {
		expect(canonicalPath('a/b.ts')).to.equal(canonicalPath(path.resolve('a/b.ts')));
		expect(path.isAbsolute(canonicalPath('a/b.ts'))).to.equal(true);
	});

	it('gives the same result for two spellings of one file, and folds case only on Windows', () => {
		const file = path.join(libraryRoot, 'Test', 'X.ts');
		if (windows) {
			expect(canonicalPath(file)).to.equal(canonicalPath(file.toUpperCase()));
			expect(canonicalPath(file)).to.equal(canonicalPath(file.replace(/\\/g, '/')));
			expect(canonicalPath(file)).to.equal(file.toLowerCase());
		} else {
			expect(canonicalPath(file)).to.equal(file);
			expect(canonicalPath(file)).to.not.equal(canonicalPath(file.toLowerCase()));
		}
	});
});

describe('canonicalFromUrl and canonicalFromFrameFile', () => {
	const file = path.join(libraryRoot, 'test', 'fixtures', 'a.ts');
	const url = pathToFileURL(file).href;

	it('turns a file URL into the canonical path, ignoring its query and fragment', () => {
		expect(canonicalFromUrl(url)).to.equal(canonicalPath(file));
		expect(canonicalFromUrl(`${url}?tsflow=3`)).to.equal(canonicalPath(file));
		expect(canonicalFromUrl(`${url}#frag`)).to.equal(canonicalPath(file));
	});

	it('returns undefined for anything that is not a well-formed file URL', () => {
		expect(canonicalFromUrl('node:fs')).to.equal(undefined);
		expect(canonicalFromUrl('https://example.com/a.js')).to.equal(undefined);
		expect(canonicalFromUrl('file:')).to.equal(undefined);
	});

	it('reads a V8 frame file name as a URL or an absolute path, and nothing else', () => {
		expect(canonicalFromFrameFile(url)).to.equal(canonicalPath(file));
		expect(canonicalFromFrameFile(file)).to.equal(canonicalPath(file));
		expect(canonicalFromFrameFile('node:internal/modules/cjs/loader')).to.equal(undefined);
		expect(canonicalFromFrameFile('relative.js')).to.equal(undefined);
	});
});

describe('withoutQuery', () => {
	it('strips the query, the fragment, or nothing', () => {
		expect(withoutQuery('file:///a/b.ts?tsflow=1')).to.equal('file:///a/b.ts');
		expect(withoutQuery('file:///a/b.ts#x')).to.equal('file:///a/b.ts');
		expect(withoutQuery('file:///a/b.ts?x=1#y')).to.equal('file:///a/b.ts');
		expect(withoutQuery('file:///a/b.ts')).to.equal('file:///a/b.ts');
	});
});

describe('isProjectModule', () => {
	it('excludes anything under a node_modules directory', () => {
		expect(isProjectModule(canonicalPath('/p/node_modules/dep/index.js'))).to.equal(false);
		expect(isProjectModule(canonicalPath('/p/a/node_modules/x.js'))).to.equal(false);
	});

	it('does not treat a name that merely contains node_modules as a dependency', () => {
		expect(isProjectModule(canonicalPath('/p/node_modules_backup/x.js'))).to.equal(true);
	});

	it('excludes this library itself even though it is not installed under node_modules here', () => {
		expect(isProjectModule(canonicalPath(path.join(libraryRoot, 'lib', 'utils', 'module-graph.js')))).to.equal(false);
		expect(isProjectModule(canonicalPath(libraryRoot))).to.equal(false);
	});

	it('does not exclude a sibling whose name starts with the library root', () => {
		expect(isProjectModule(canonicalPath(`${libraryRoot}-consumer/src/steps.ts`))).to.equal(true);
	});

	it('keeps project files', () => {
		expect(isProjectModule(canonicalPath('/p/src/steps.ts'))).to.equal(true);
	});
});

describe('ES module import edges', () => {
	const directory = temporaryDirectory('esm-graph');
	const file = (name: string): string => path.join(directory, name);
	const url = (name: string): string => pathToFileURL(file(name)).href;
	const key = (name: string): string => canonicalPath(file(name));

	it('walks recorded edges from an entry, entry first, once per module, cycles included', () => {
		recordImportEdge(url('entry.mts'), url('child.mts'));
		recordImportEdge(url('child.mts'), url('grandchild.mts'));
		recordImportEdge(url('grandchild.mts'), url('entry.mts'));
		recordImportEdge(url('entry.mts'), url('child.mts'));
		expect(importedProjectModules(file('entry.mts'))).to.deep.equal([
			key('entry.mts'),
			key('child.mts'),
			key('grandchild.mts')
		]);
		expect(importedProjectModules(file('child.mts'))).to.deep.equal([
			key('child.mts'),
			key('grandchild.mts'),
			key('entry.mts')
		]);
	});

	it('ignores edges to or from dependencies, the library and non-file URLs, and edges without a parent', () => {
		recordImportEdge(url('entry.mts'), pathToFileURL(file('node_modules/dep/index.js')).href);
		recordImportEdge(url('entry.mts'), pathToFileURL(path.join(libraryRoot, 'lib', 'bindings.js')).href);
		recordImportEdge(url('entry.mts'), 'node:fs');
		recordImportEdge(pathToFileURL(file('node_modules/dep/index.js')).href, url('child.mts'));
		recordImportEdge(undefined, url('orphan.mts'));
		expect(importedProjectModules(file('entry.mts'))).to.deep.equal([
			key('entry.mts'),
			key('child.mts'),
			key('grandchild.mts')
		]);
		expect(knownProjectModules().has(key('orphan.mts'))).to.equal(false);
	});

	it('finds every module that depends on a changed one, excluding the changed one itself', () => {
		recordImportEdge(url('other.mts'), url('leaf.mts'));
		recordImportEdge(url('child.mts'), url('leaf.mts'));
		const dependents = dependentProjectModules([key('leaf.mts')]);
		expect(dependents.has(key('leaf.mts'))).to.equal(false);
		expect(dependents.has(key('other.mts'))).to.equal(true);
		expect(dependents.has(key('child.mts'))).to.equal(true);
		// The cycle: entry imports child, and grandchild imports entry
		expect(dependents.has(key('entry.mts'))).to.equal(true);
		expect(dependents.has(key('grandchild.mts'))).to.equal(true);
	});

	it('lists every module seen on either side of an edge', () => {
		const known = knownProjectModules();
		for (const name of ['entry.mts', 'child.mts', 'grandchild.mts', 'other.mts', 'leaf.mts']) {
			expect(known.has(key(name)), name).to.equal(true);
		}
	});

	it('leaves every URL alone while no module has been versioned, a stale version query included', () => {
		expect(versionedUrl(url('child.mts'))).to.equal(url('child.mts'));
		expect(versionedUrl(`${url('child.mts')}?tsflow=9`)).to.equal(`${url('child.mts')}?tsflow=9`);
	});

	it('appends the version to a versioned module, replaces a previous version, and keeps foreign queries', () => {
		bumpModuleVersions([key('child.mts')], 1);
		expect(versionedUrl(url('child.mts'))).to.equal(`${url('child.mts')}?tsflow=1`);
		expect(versionedUrl(`${url('child.mts')}?tsflow=0`)).to.equal(`${url('child.mts')}?tsflow=1`);
		expect(versionedUrl(`${url('child.mts')}?hot=1`)).to.equal(`${url('child.mts')}?hot=1`);
		expect(versionedUrl('node:fs')).to.equal('node:fs');
		bumpModuleVersions([key('child.mts')], 2);
		expect(versionedUrl(url('child.mts'))).to.equal(`${url('child.mts')}?tsflow=2`);
	});

	it('strips a stale version query from a module that is not versioned once any module is', () => {
		expect(versionedUrl(`${url('other.mts')}?tsflow=1`)).to.equal(url('other.mts'));
		expect(versionedUrl(url('other.mts'))).to.equal(url('other.mts'));
	});

	it('forgets the outgoing edges of a versioned module until its re-evaluation records them again', () => {
		expect(importedProjectModules(file('child.mts'))).to.deep.equal([key('child.mts')]);
		recordImportEdge(url('child.mts'), url('grandchild.mts'));
		expect(importedProjectModules(file('child.mts'))).to.deep.equal([
			key('child.mts'),
			key('grandchild.mts'),
			key('entry.mts')
		]);
	});
});

describe('CommonJS modules through require.cache', () => {
	const directory = temporaryDirectory('cjs-graph');
	const file = (name: string): string => path.join(directory, name);
	const key = (name: string): string => canonicalPath(file(name));
	mkdirSync(file('node_modules/dep'), { recursive: true });
	writeFileSync(file('node_modules/dep/index.js'), 'module.exports = "dep";');
	writeFileSync(
		file('helper.cjs'),
		'globalThis.__tsflowHelperEvaluations = (globalThis.__tsflowHelperEvaluations ?? 0) + 1;'
	);
	writeFileSync(
		file('entry.cjs'),
		"require('./helper.cjs'); require('./node_modules/dep/index.js'); module.exports = 'entry';"
	);
	writeFileSync(file('unrelated.cjs'), "module.exports = 'unrelated';");
	const evaluations = (): number =>
		(globalThis as { __tsflowHelperEvaluations?: number }).__tsflowHelperEvaluations ?? 0;

	it('walks the cached children of a required entry, leaving dependencies out', () => {
		require(file('entry.cjs'));
		require(file('unrelated.cjs'));
		expect(evaluations()).to.equal(1);
		expect(requiredProjectModules(file('entry.cjs'))).to.deep.equal([key('entry.cjs'), key('helper.cjs')]);
	});

	it('returns only the entry when it has not been required', () => {
		expect(requiredProjectModules(file('never.cjs'))).to.deep.equal([key('never.cjs')]);
	});

	it('finds the requirers of a changed module', () => {
		const dependents = dependentProjectModules([key('helper.cjs')]);
		expect(dependents.has(key('entry.cjs'))).to.equal(true);
		expect(dependents.has(key('helper.cjs'))).to.equal(false);
		expect(dependents.has(key('unrelated.cjs'))).to.equal(false);
	});

	it('knows every cached project module and no dependency', () => {
		const known = knownProjectModules();
		expect(known.has(key('entry.cjs'))).to.equal(true);
		expect(known.has(key('helper.cjs'))).to.equal(true);
		expect(known.has(key('unrelated.cjs'))).to.equal(true);
		expect(known.has(canonicalPath(file('node_modules/dep/index.js')))).to.equal(false);
	});

	it('evicts the named modules so that their next require evaluates them again', () => {
		expect(evictRequiredModules(new Set([key('helper.cjs')]))).to.equal(1);
		expect(evictRequiredModules(new Set([key('helper.cjs')]))).to.equal(0);
		require(file('entry.cjs'));
		expect(evaluations(), 'the cached entry still holds the old helper').to.equal(1);
		require(file('helper.cjs'));
		expect(evaluations()).to.equal(2);
	});
});

describe('reload listeners', () => {
	it('calls every listener on notifyReload until it is removed', () => {
		let calls = 0;
		const remove = addReloadListener(() => calls++);
		notifyReload();
		notifyReload();
		expect(calls).to.equal(2);
		remove();
		notifyReload();
		expect(calls).to.equal(2);
	});
});
