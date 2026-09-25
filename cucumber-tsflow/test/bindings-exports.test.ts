import { describe, it } from 'node:test';
import { expect } from 'chai';
import { createRequire } from 'node:module';
import path from 'node:path';
import bindingsCjs from '../lib/bindings.js';
import * as bindingsEsm from '../lib/bindings.mjs';
import rootCjs from '../lib/index.js';
import * as rootEsm from '../lib/wrapper.mjs';

const require = createRequire(import.meta.url);
const libraryCli = path.join(import.meta.dirname, '..', 'lib', 'cli') + path.sep;

/** Runtime export names of a module, without the CommonJS interop marker. */
function names(module: object): string[] {
	return Object.keys(module)
		.filter(name => name !== '__esModule')
		.sort();
}

describe('the bindings entry point', () => {
	it('exports the same names from its CommonJS and ES module forms', () => {
		expect(names(bindingsEsm)).to.deep.equal(names(bindingsCjs));
	});

	it('exports the same values from both forms', () => {
		const cjs = bindingsCjs as unknown as Record<string, unknown>;
		const esm = bindingsEsm as unknown as Record<string, unknown>;
		for (const name of names(bindingsCjs)) expect(esm[name], name).to.equal(cjs[name]);
	});

	it('is a subset of the package root', () => {
		const root = new Set(names(rootCjs));
		for (const name of names(bindingsCjs)) expect(root.has(name), name).to.equal(true);
	});
});

describe('the package root', () => {
	it('exports the same names from its CommonJS and ES module forms', () => {
		expect(names(rootEsm)).to.deep.equal(names(rootCjs));
	});

	it('does not load the CLI until Cli is constructed', () => {
		const loaded = Object.keys(require.cache).filter(key => key.startsWith(libraryCli));
		expect(loaded).to.deep.equal([]);
	});
});
