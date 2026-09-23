import { describe, it } from 'node:test';
import { expect } from 'chai';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import type { ITsflowConfiguration } from '../../lib/cli/argv-parser.js';
import loadConfigurationModule from '../../lib/api/load-configuration.js';
import { temporaryDirectory } from '../helpers/temp.ts';

const { loadConfiguration } = loadConfigurationModule;
type Provided = NonNullable<Parameters<typeof loadConfiguration>[0]>['provided'];
const cwd = temporaryDirectory('load-configuration');
const globals = globalThis as { experimentalDecorators?: boolean };

/** `text` without its escape sequences. */
function strip(text: string): string {
	// eslint-disable-next-line no-control-regex
	return text.replace(/\x1b\[[\d;?]*[ -/]*[@-~]/g, '');
}

function capture() {
	let text = '';
	const stream = new Writable({
		write(chunk, _encoding, callback) {
			text += String(chunk);
			callback();
		}
	});
	return { stream, text: () => strip(text) };
}

/** Load with `provided` as the command line's contribution and `file` as the configuration file, if any. */
async function load(provided: Partial<ITsflowConfiguration>, file: string | false = false) {
	const stdout = capture();
	const stderr = capture();
	const result = await loadConfiguration(
		{ file, provided: provided as Provided },
		{ cwd, stdout: stdout.stream, stderr: stderr.stream, env: process.env }
	);
	return { ...result, stdout: stdout.text() };
}

describe('loadConfiguration', () => {
	it('takes transpileCache from the option, publishes it to the environment, and defaults it from there', async () => {
		delete process.env.TSFLOW_TRANSPILE_CACHE;
		try {
			expect((await load({})).useConfiguration.transpileCache).to.equal(true);
			expect(process.env.TSFLOW_TRANSPILE_CACHE).to.equal('true');
			expect((await load({ transpileCache: false })).useConfiguration.transpileCache).to.equal(false);
			expect(process.env.TSFLOW_TRANSPILE_CACHE).to.equal('false');
			expect((await load({})).useConfiguration.transpileCache, 'the environment is the default').to.equal(false);
			process.env.TSFLOW_TRANSPILE_CACHE = 'true';
			expect((await load({ transpileCache: false })).useConfiguration.transpileCache).to.equal(false);
		} finally {
			delete process.env.TSFLOW_TRANSPILE_CACHE;
		}
	});

	it('takes selectiveLoad from the option, else from TSFLOW_SELECTIVE_LOAD, without writing it back', async () => {
		delete process.env.TSFLOW_SELECTIVE_LOAD;
		try {
			expect((await load({})).useConfiguration.selectiveLoad).to.equal(false);
			expect(process.env.TSFLOW_SELECTIVE_LOAD).to.equal(undefined);
			process.env.TSFLOW_SELECTIVE_LOAD = 'true';
			expect((await load({})).useConfiguration.selectiveLoad).to.equal(true);
			expect((await load({ selectiveLoad: false })).useConfiguration.selectiveLoad).to.equal(false);
			expect(process.env.TSFLOW_SELECTIVE_LOAD).to.equal('true');
		} finally {
			delete process.env.TSFLOW_SELECTIVE_LOAD;
		}
	});

	it('prints the deprecation notice when parallelLoad comes from the command line', async () => {
		const { stdout } = await load({ parallelLoad: true });
		expect(stdout).to.include('DEPRECATION NOTICE');
		expect(stdout).to.include('the --parallel-load flag from the command line');
		expect((await load({})).stdout).to.not.include('DEPRECATION NOTICE');
	});

	it('names the configuration file when parallelLoad comes from it', async () => {
		writeFileSync(path.join(cwd, 'parallel.json'), JSON.stringify({ default: { parallelLoad: 4 } }));
		const { stdout, useConfiguration } = await load({}, 'parallel.json');
		expect(useConfiguration.parallelLoad).to.equal(4);
		expect(stdout).to.include('"parallelLoad" from "parallel.json"');
	});

	it('defaults experimentalDecorators to false and publishes it to the global and the environment', async () => {
		const plain = await load({});
		expect(plain.useConfiguration.experimentalDecorators).to.equal(false);
		expect(plain.runConfiguration.runtime.experimentalDecorators).to.equal(false);
		expect(globals.experimentalDecorators).to.equal(false);
		expect(process.env.CUCUMBER_EXPERIMENTAL_DECORATORS).to.equal('false');
		const experimental = await load({ experimentalDecorators: true });
		expect(experimental.runConfiguration.runtime.experimentalDecorators).to.equal(true);
		expect(globals.experimentalDecorators).to.equal(true);
		expect(process.env.CUCUMBER_EXPERIMENTAL_DECORATORS).to.equal('true');
		await load({});
	});

	it('expands the transpiler setting into require modules or loaders', async () => {
		const esnode = await load({ transpiler: 'es-node' });
		expect(esnode.runConfiguration.support.requireModules).to.include(
			'@lynxwall/cucumber-tsflow/lib/transpilers/esnode'
		);
		expect(esnode.runConfiguration.support.loaders).to.deep.equal([]);

		const tsnode = await load({ transpiler: 'ts-node', experimentalDecorators: true });
		expect(tsnode.runConfiguration.support.requireModules).to.include(
			'@lynxwall/cucumber-tsflow/lib/transpilers/tsnode-exp'
		);
		await load({});

		const esm = await load({ transpiler: 'es-node-esm' });
		expect(esm.runConfiguration.support.loaders).to.deep.equal([
			'@lynxwall/cucumber-tsflow/lib/transpilers/esm/esnode-loader'
		]);
		expect(esm.runConfiguration.support.requireModules).to.deep.equal([]);

		const vue = await load({ transpiler: 'es-vue-esm' });
		expect(vue.runConfiguration.support.loaders).to.deep.equal([
			'@lynxwall/cucumber-tsflow/lib/transpilers/esm/esvue-loader'
		]);
		expect(vue.runConfiguration.support.requirePaths?.some(p => p.endsWith('vue-jsdom-setup.mjs'))).to.equal(true);
	});

	it('replaces the behave and junitbamboo format aliases and sets the snippet syntax', async () => {
		const { runConfiguration } = await load({ format: ['behave:out.json', 'junitbamboo:out.xml', 'progress'] });
		expect(runConfiguration.formats.stdout).to.equal('progress');
		expect(runConfiguration.formats.files).to.deep.equal({
			'out.json': '@lynxwall/cucumber-tsflow/behave',
			'out.xml': '@lynxwall/cucumber-tsflow/junitbamboo'
		});
		expect(runConfiguration.formats.options.snippetSyntax).to.equal('@lynxwall/cucumber-tsflow/snippet');
	});

	it('clears the profile paths when features are given on the command line', async () => {
		writeFileSync(path.join(cwd, 'paths.json'), JSON.stringify({ default: { paths: ['features/**/*.feature'] } }));
		expect((await load({}, 'paths.json')).useConfiguration.paths).to.deep.equal(['features/**/*.feature']);
		expect((await load({ paths: ['one.feature'] }, 'paths.json')).useConfiguration.paths).to.deep.equal([
			'one.feature'
		]);
	});
});
