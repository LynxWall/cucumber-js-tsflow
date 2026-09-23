import { describe, it } from 'node:test';
import { expect } from 'chai';
import loaderSourceMaps from '../../lib/utils/loader-source-maps.js';

const { sourceMapRegisterOptions, loaderSourceMap } = loaderSourceMaps;

describe('loader-source-maps', () => {
	it('returns a map recorded on this thread without any relay port', () => {
		const store = (globalThis.__CUCUMBER_TSFLOW_SOURCE_MAPS ??= new Map<string, string>());
		store.set('file:///in-thread.ts', '{"version":3,"in":"thread"}');
		expect(loaderSourceMap('file:///in-thread.ts')).to.equal('{"version":3,"in":"thread"}');
	});

	it('returns undefined for a module no loader transpiled', () => {
		expect(loaderSourceMap('file:///never-loaded.ts')).to.equal(undefined);
	});

	it('hands out a transferable port and drains the maps relayed on it when a lookup misses', () => {
		const options = sourceMapRegisterOptions();
		expect(options.transferList).to.deep.equal([options.data.tsflowSourceMapPort]);

		// What the loader does on the hooks thread after each transpile
		options.data.tsflowSourceMapPort.postMessage({ url: 'file:///relayed-a.ts', sourceMap: '{"a":1}' });
		options.data.tsflowSourceMapPort.postMessage({ url: 'file:///relayed-b.ts', sourceMap: '{"b":2}' });

		expect(loaderSourceMap('file:///relayed-b.ts')).to.equal('{"b":2}');
		// The first miss drained both messages into the shared store
		expect(globalThis.__CUCUMBER_TSFLOW_SOURCE_MAPS?.get('file:///relayed-a.ts')).to.equal('{"a":1}');
		expect(loaderSourceMap('file:///relayed-a.ts')).to.equal('{"a":1}');
		options.data.tsflowSourceMapPort.close();
	});
});
