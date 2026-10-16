import 'polyfill-symbol-metadata';
import { describe, it } from 'node:test';
import { expect } from 'chai';
import { createRequire } from 'node:module';
import path from 'node:path';
import loadSupportModule from '../../lib/api/load-support.js';

const require = createRequire(import.meta.url);
// The es-node transpiler, so that the TypeScript fixtures load through require()
require('../../lib/transpilers/esnode.js');

const { loadSupport, reloadSupport } = loadSupportModule;
type LoadSupportOptions = Parameters<typeof loadSupport>[0];
/** The loaded library's step definitions; the API's `ISupportCodeLibrary` type keeps the library opaque. */
type Library = { stepDefinitions: Array<{ pattern: string | RegExp }> };

const fixtures = path.join(import.meta.dirname, '..', 'fixtures', 'support');
const options = {
	sources: { defaultDialect: 'en', paths: [], names: [], tagExpression: '', order: 'defined' },
	support: { requireModules: [], requirePaths: [path.join(fixtures, 'steps-c.ts')], loaders: [], importPaths: [] }
} as unknown as LoadSupportOptions;
const environment = { cwd: fixtures };

const patterns = (library: unknown): string[] =>
	(library as Library).stepDefinitions.map(definition => String(definition.pattern)).sort();

describe('loadSupport', () => {
	// The tests run in order: the first load in this process is the one a fresh process makes
	it('builds the library from the support files and the binding modules they import', async () => {
		const library = await loadSupport(options, environment);
		expect(patterns(library)).to.deep.equal(['a step from file c', 'a step from the helper module']);
	});

	it('returns the same complete library on a later call, bindings of imported modules included', async () => {
		// steps-c.ts is a support file and evaluates again; helper-bindings.ts is not, and used to stay cached with
		// its decorators never running again, so its step was missing from every library after the first
		const again = await loadSupport(options, environment);
		expect(patterns(again)).to.deep.equal(['a step from file c', 'a step from the helper module']);
		const reloaded = await reloadSupport(options, [], environment);
		expect(patterns(reloaded)).to.deep.equal(['a step from file c', 'a step from the helper module']);
	});
});
