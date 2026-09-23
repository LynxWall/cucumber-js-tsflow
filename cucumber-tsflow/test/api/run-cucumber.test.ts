import 'polyfill-symbol-metadata';
import { describe, it } from 'node:test';
import { expect } from 'chai';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { Writable } from 'node:stream';
import type { Envelope } from '@cucumber/messages';
import loadConfigurationModule from '../../lib/api/load-configuration.js';
import runCucumberModule from '../../lib/api/run-cucumber.js';
import { temporaryDirectory } from '../helpers/temp.ts';

const { loadConfiguration } = loadConfigurationModule;
const { runCucumber } = runCucumberModule;

// A whole run in this process, on the es-node transpiler, against the decorated fixtures under test/fixtures
const fixtures = path.join(import.meta.dirname, '..', 'fixtures', 'support');
const supportFiles = ['steps-a.ts', 'steps-b.ts'].map(name => path.join(fixtures, name));
const require = createRequire(import.meta.url);
const features = temporaryDirectory('run-cucumber');
writeFileSync(
	path.join(features, 'good.feature'),
	['Feature: Buffered parsing', '', '  Scenario: One step', '    Given a step from file a', ''].join('\n')
);
// A second Feature line is a Gherkin parse error; free text under a scenario would only be its description
writeFileSync(
	path.join(features, 'broken.feature'),
	['Feature: Broken', '', '  Scenario: One step', '    Given a step from file a', 'Feature: Twice', ''].join('\n')
);

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

/**
 * Run `feature` with the fixture support files, collecting every envelope in the order it was emitted. The support
 * files are evicted first: a one-shot run evaluates them afresh, and this process has run before.
 */
async function run(feature: string) {
	for (const file of supportFiles) delete require.cache[require.resolve(file)];
	const stdout = capture();
	const stderr = capture();
	const environment = { cwd: fixtures, stdout: stdout.stream, stderr: stderr.stream, env: { ...process.env } };
	const { runConfiguration } = await loadConfiguration(
		{
			file: false,
			provided: {
				paths: [path.join(features, feature)],
				require: supportFiles,
				format: ['progress'],
				transpiler: 'es-node',
				selectiveLoad: false
			} as never
		},
		environment
	);
	const envelopes: Envelope[] = [];
	const result = await runCucumber(runConfiguration, environment, envelope => envelopes.push(envelope));
	const kinds = envelopes.map(envelope => Object.keys(envelope)[0]);
	return { result, kinds, stdout: stdout.text(), stderr: stderr.text() };
}

describe('runCucumber', () => {
	it('parses the features before loading support code, then replays them to the formatters in the usual order', async () => {
		const { result, kinds, stdout } = await run('good.feature');
		expect(result.success, stdout).to.equal(true);
		// The Gherkin envelopes were produced before the support code loaded and emitted after the meta message
		expect(kinds.slice(0, 4)).to.deep.equal(['meta', 'source', 'gherkinDocument', 'pickle']);
		const firstSupport = kinds.findIndex(kind => kind === 'stepDefinition' || kind === 'hook');
		expect(firstSupport).to.be.greaterThan(3);
		expect(kinds.indexOf('testRunStarted')).to.be.greaterThan(firstSupport);
		expect(kinds.at(-1)).to.equal('testRunFinished');
		expect(kinds.filter(kind => kind === 'testCaseFinished')).to.have.length(1);
		// The startup phases report on the parsed scenarios before the load phase begins
		expect(stdout.indexOf('1 scenario to run')).to.be.lessThan(stdout.indexOf('Packing the jars'));
		expect(stdout).to.include('1 scenario (1 passed)');
	});

	it('reports a parse error after loading the support code, without running anything', async () => {
		const { result, kinds, stdout, stderr } = await run('broken.feature');
		expect(result.success).to.equal(false);
		expect(kinds).to.include('parseError');
		expect(kinds).to.not.include('testRunStarted');
		expect(kinds.indexOf('meta')).to.equal(0);
		// The support code was loaded (the load phase reports its definitions) but its messages are never emitted
		expect(kinds).to.not.include('stepDefinition');
		expect(stdout).to.include('1 parse error');
		expect(stdout).to.include('3 step definitions');
		expect(stderr).to.include('Parse error in');
	});
});
