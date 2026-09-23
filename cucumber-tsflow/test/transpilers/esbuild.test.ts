import { describe, it } from 'node:test';
import { expect } from 'chai';
import path from 'node:path';
import esbuildCjs from '../../lib/transpilers/esbuild.js';
import * as esbuildEsm from '../../lib/transpilers/esm/esbuild.mjs';

// The transform itself is under test here, not the cache around it
process.env.TSFLOW_TRANSPILE_CACHE = 'false';

const { transformOptionsFor, esbuildCacheKey } = esbuildCjs;

const file = path.join(process.cwd(), 'src', 'steps.ts');
const code = 'export const answer: number = 42;\n';

/** `options` without the keys an output format fixes. */
function sansFormat(options: Record<string, unknown>): Record<string, unknown> {
	const { format: _format, platform: _platform, ...rest } = options;
	return rest;
}

describe('transformOptionsFor', () => {
	it('gives the CommonJS and ES module callers the same options apart from the output format', () => {
		const cjs = transformOptionsFor(file, undefined, undefined, { format: 'cjs' }, false);
		const esm = transformOptionsFor(file, undefined, undefined, { format: 'esm', platform: 'node' }, false);
		expect(cjs.format).to.equal('cjs');
		expect(esm.format).to.equal('esm');
		expect(esm.platform).to.equal('node');
		expect(sansFormat(esm as Record<string, unknown>)).to.deep.equal(sansFormat(cjs as Record<string, unknown>));
	});

	it('picks the loader from the file extension unless an extension is given', () => {
		expect(transformOptionsFor(file, undefined, undefined, { format: 'cjs' }, false).loader).to.equal('ts');
		expect(transformOptionsFor(file, '.tsx', undefined, { format: 'cjs' }, false).loader).to.equal('tsx');
		expect(transformOptionsFor('a.json', undefined, undefined, { format: 'cjs' }, false).loader).to.equal('json');
	});

	it('lets the caller extend the loaders table and override the fixed options', () => {
		// The `esbuild` option's declared type is the intersection of esbuild's option types, in which `loader`
		// is a single loader; the object form is what a configuration file gives and what getLoaders reads.
		const options = { esbuild: { loader: { '.svg': 'text' }, target: ['es2020'] } } as unknown as Parameters<
			typeof transformOptionsFor
		>[2];
		const result = transformOptionsFor('icon.svg', undefined, options, { format: 'cjs' }, false);
		expect(result.loader).to.equal('text');
		expect(result.target).to.deep.equal(['es2020']);
		expect(result.sourcefile).to.equal('icon.svg');
	});

	it('carries the decorator mode in tsconfigRaw, and in the cache key', () => {
		const legacy = transformOptionsFor(file, undefined, undefined, { format: 'cjs' }, true);
		const standard = transformOptionsFor(file, undefined, undefined, { format: 'cjs' }, false);
		const compilerOptions = (raw: unknown): Record<string, unknown> =>
			(raw as { compilerOptions: Record<string, unknown> }).compilerOptions;
		expect(compilerOptions(legacy.tsconfigRaw).experimentalDecorators).to.equal(true);
		expect(compilerOptions(standard.tsconfigRaw)).to.not.have.property('experimentalDecorators');
		expect(esbuildCacheKey(legacy)).to.not.equal(esbuildCacheKey(standard));
	});
});

describe('the two transpileCode entry points', () => {
	it('emit CommonJS and an ES module from the same source', () => {
		const cjs = esbuildCjs.transpileCode(code, file);
		const esm = esbuildEsm.transpileCode(code, file);
		expect(cjs.output).to.include('exports');
		expect(cjs.output).to.not.include('export const');
		expect(esm.output).to.include('export {');
		expect(esm.output).to.not.include('exports');
		expect(cjs.sourceMap).to.be.a('string');
		expect(esm.sourceMap).to.be.a('string');
	});
});
