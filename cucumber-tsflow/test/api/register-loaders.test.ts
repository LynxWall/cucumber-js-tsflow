import { describe, it } from 'node:test';
import { expect } from 'chai';
import * as nodeModule from 'node:module';
import path from 'node:path';
import registerLoaders from '../../lib/api/register-loaders.js';

const { loaderHooksMode, registerLoader, registeredLoaders } = registerLoaders;
const registerHooksAvailable = typeof (nodeModule as { registerHooks?: unknown }).registerHooks === 'function';
const inThread = registerHooksAvailable ? 'sync' : 'async';
const ESM = '@lynxwall/cucumber-tsflow/lib/transpilers/esm';
const forced = process.env.TSFLOW_ESM_HOOKS;

function restore(): void {
	if (forced === undefined) delete process.env.TSFLOW_ESM_HOOKS;
	else process.env.TSFLOW_ESM_HOOKS = forced;
}

describe('loaderHooksMode', () => {
	it('attaches the esbuild loaders in-thread when Node has registerHooks, however they are spelled', () => {
		delete process.env.TSFLOW_ESM_HOOKS;
		try {
			const spellings = [
				`${ESM}/esnode-loader`,
				`${ESM}/esvue-loader`,
				`${ESM}/esnode-loader.mjs`,
				'C:\\consumer\\node_modules\\@lynxwall\\cucumber-tsflow\\lib\\transpilers\\esm\\esvue-loader.mjs',
				'/consumer/node_modules/@lynxwall/cucumber-tsflow/lib/transpilers/esm/esnode-loader.mjs'
			];
			for (const specifier of spellings) expect(loaderHooksMode(specifier), specifier).to.equal(inThread);
		} finally {
			restore();
		}
	});

	it('puts every other loader on the hooks thread', () => {
		delete process.env.TSFLOW_ESM_HOOKS;
		try {
			const others = [`${ESM}/tsnode-loader`, `${ESM}/vue-loader`, 'ts-node/esm', './my-loader.mjs', 'esnode-loader'];
			for (const specifier of others) expect(loaderHooksMode(specifier), specifier).to.equal('async');
		} finally {
			restore();
		}
	});

	it('puts everything on the hooks thread under TSFLOW_ESM_HOOKS=async', () => {
		process.env.TSFLOW_ESM_HOOKS = 'async';
		try {
			expect(loaderHooksMode(`${ESM}/esnode-loader`)).to.equal('async');
			expect(loaderHooksMode(`${ESM}/tsnode-loader`)).to.equal('async');
		} finally {
			restore();
		}
	});
});

describe('registerLoader', () => {
	// Really attaches the loader to this process, so this runs last in the file
	it('attaches a loader once per process however often it is asked', async () => {
		const specifier = `${ESM}/esnode-loader`;
		const mode = loaderHooksMode(specifier);
		expect(registeredLoaders()).to.deep.equal({ sync: [], async: [] });
		expect(await registerLoader(specifier)).to.equal(mode);
		expect(await registerLoader(specifier)).to.equal(mode);
		const { sync, async } = registeredLoaders();
		if (mode === 'sync') {
			expect(sync).to.have.length(1);
			expect(path.basename(sync[0])).to.equal('esnode-loader.mjs');
			expect(async).to.deep.equal([]);
		} else {
			expect(async).to.deep.equal([specifier]);
			expect(sync).to.deep.equal([]);
		}
	});
});
