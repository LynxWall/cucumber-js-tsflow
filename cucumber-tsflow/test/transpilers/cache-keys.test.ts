import { describe, it } from 'node:test';
import { expect } from 'chai';
import { createRequire } from 'node:module';
import path from 'node:path';
import cache from '../../lib/transpilers/transpile-cache.js';
import esbuildCjs from '../../lib/transpilers/esbuild.js';
import * as esbuildEsm from '../../lib/transpilers/esm/esbuild.mjs';
import vueSfc from '../../lib/transpilers/vue-sfc-compiler.js';
import { temporaryDirectory } from '../helpers/temp.ts';

// The three transpilers build their own cache-key strings; these tests check that every input each one
// promises to cover really changes the key, by watching whether the transpiler runs or the cache answers.
const store = temporaryDirectory('cache-keys');
process.env.TSFLOW_TRANSPILE_CACHE_DIR = store;
delete process.env.TSFLOW_TRANSPILE_CACHE;
delete process.env.CUCUMBER_EXPERIMENTAL_DECORATORS;
cache.resetTranspileCacheDirectory();

const globals = globalThis as { experimentalDecorators?: boolean };
const require = createRequire(import.meta.url);

/** Whether the transpiler ran for the single lookup in `fn`, read from this thread's counters. */
function transpiled(fn: () => unknown): boolean {
	cache.resetTranspileCacheStats();
	fn();
	const { hits, misses } = cache.getTranspileCacheStats();
	expect(hits + misses, 'the call went through the cache once').to.equal(1);
	return misses === 1;
}

const file = path.join(store, 'src', 'steps.ts');
const code = 'export const answer: number = 42;\n';

describe('the CommonJS esbuild transpiler key', () => {
	it('serves an unchanged file from the cache with the same output', () => {
		let first: unknown;
		let second: unknown;
		expect(transpiled(() => (first = esbuildCjs.transpileCode(code, file)))).to.equal(true);
		expect(transpiled(() => (second = esbuildCjs.transpileCode(code, file)))).to.equal(false);
		expect(second).to.deep.equal(first);
	});

	it('changes with the source', () => {
		expect(transpiled(() => esbuildCjs.transpileCode(`${code}\n`, file))).to.equal(true);
	});

	it('changes with the file name', () => {
		expect(transpiled(() => esbuildCjs.transpileCode(code, path.join(store, 'src', 'other.ts')))).to.equal(true);
	});

	it('changes with the loader the extension selects', () => {
		expect(transpiled(() => esbuildCjs.transpileCode(code, file, '.tsx'))).to.equal(true);
	});

	it('changes with the esbuild options', () => {
		const options = { esbuild: { target: ['es2020'] } };
		expect(transpiled(() => esbuildCjs.transpileCode(code, file, undefined, options))).to.equal(true);
		expect(transpiled(() => esbuildCjs.transpileCode(code, file, undefined, options))).to.equal(false);
	});

	it('changes with the decorator mode, which this transpiler reads when it loads', () => {
		const resolved = require.resolve('../../lib/transpilers/esbuild.js');
		delete require.cache[resolved];
		globals.experimentalDecorators = true;
		try {
			const experimental = require(resolved) as typeof esbuildCjs;
			expect(transpiled(() => experimental.transpileCode(code, file))).to.equal(true);
			expect(transpiled(() => experimental.transpileCode(code, file))).to.equal(false);
		} finally {
			globals.experimentalDecorators = false;
			delete require.cache[resolved];
		}
	});
});

describe('the ES module esbuild transpiler key', () => {
	it('serves an unchanged file from the cache', () => {
		expect(transpiled(() => esbuildEsm.transpileCode(code, file))).to.equal(true);
		expect(transpiled(() => esbuildEsm.transpileCode(code, file))).to.equal(false);
	});

	it('does not share entries with the CommonJS transpiler', () => {
		const source = 'export const shared = true;\n';
		expect(transpiled(() => esbuildCjs.transpileCode(source, file))).to.equal(true);
		expect(transpiled(() => esbuildEsm.transpileCode(source, file))).to.equal(true);
	});

	it('changes with the esbuild options', () => {
		const options = { esbuild: { target: ['es2020'] } };
		expect(transpiled(() => esbuildEsm.transpileCode(code, file, undefined, options))).to.equal(true);
	});

	it('changes with the decorator mode, which this transpiler reads from the environment when it loads', async () => {
		process.env.CUCUMBER_EXPERIMENTAL_DECORATORS = 'true';
		try {
			const specifier = new URL('../../lib/transpilers/esm/esbuild.mjs?decorators=experimental', import.meta.url).href;
			const experimental = (await import(specifier)) as typeof esbuildEsm;
			expect(transpiled(() => experimental.transpileCode(code, file))).to.equal(true);
			expect(transpiled(() => experimental.transpileCode(code, file))).to.equal(false);
		} finally {
			delete process.env.CUCUMBER_EXPERIMENTAL_DECORATORS;
		}
	});
});

describe('the Vue SFC compiler key', () => {
	const component = path.join(store, 'src', 'Hello.vue');
	const sfc = [
		'<template><div class="hello">{{ count }}</div></template>',
		'<script lang="ts">export default { data() { return { count: 1 }; } };</script>',
		'<style scoped>.hello { color: red; }</style>',
		''
	].join('\n');

	it('serves an unchanged component from the cache', () => {
		expect(transpiled(() => vueSfc.compileVueSFC(sfc, component))).to.equal(true);
		expect(transpiled(() => vueSfc.compileVueSFC(sfc, component))).to.equal(false);
	});

	it('changes with the output format', () => {
		expect(transpiled(() => vueSfc.compileVueSFC(sfc, component, { format: 'esm' }))).to.equal(true);
	});

	it('changes with the style flag', () => {
		expect(transpiled(() => vueSfc.compileVueSFC(sfc, component, { enableStyle: true }))).to.equal(true);
	});

	it('changes with the decorator mode, which this compiler reads on every call', () => {
		globals.experimentalDecorators = true;
		try {
			expect(transpiled(() => vueSfc.compileVueSFC(sfc, component))).to.equal(true);
			expect(transpiled(() => vueSfc.compileVueSFC(sfc, component))).to.equal(false);
		} finally {
			globals.experimentalDecorators = false;
		}
		expect(transpiled(() => vueSfc.compileVueSFC(sfc, component))).to.equal(false);
	});
});
