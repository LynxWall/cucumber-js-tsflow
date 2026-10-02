import { describe, it } from 'node:test';
import { expect } from 'chai';
import { createRequire } from 'node:module';
import path from 'node:path';
import bindings from '../lib/bindings.js';

const require = createRequire(import.meta.url);
const library = path.join(import.meta.dirname, '..', 'lib') + path.sep;

/**
 * In its own process, so nothing but the bindings entry point has been loaded: a support file that imports
 * `@lynxwall/cucumber-tsflow/bindings` must not pay for the formatters, the CLI or the API layer.
 */
describe('loading only the bindings entry point', () => {
	it('provides the decorators and the CucumberJS helpers', () => {
		expect(bindings.binding).to.be.a('function');
		expect(bindings.given).to.be.a('function');
		expect(bindings.defineParameterType).to.be.a('function');
		expect(bindings.Status.PASSED).to.equal('PASSED');
	});

	it('leaves the formatters, the CLI and the API out of the module cache', () => {
		const heavy = Object.keys(require.cache)
			.filter(key => key.startsWith(library))
			.filter(key => /[\\/](formatter|cli|api)[\\/]/.test(key.slice(library.length)));
		expect(heavy).to.deep.equal([]);
	});
});
