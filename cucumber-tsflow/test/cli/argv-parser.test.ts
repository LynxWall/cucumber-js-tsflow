import { describe, it } from 'node:test';
import { expect } from 'chai';
import argvParser from '../../lib/cli/argv-parser.js';

const ArgvParser = argvParser.default;

/** `argv` as Node presents it: the executable, the script, then the user's arguments. */
function parse(...args: string[]) {
	return ArgvParser.parse(['node', 'cucumber-tsflow', ...args]);
}

describe('ArgvParser.parse', () => {
	it('leaves every paired boolean undefined when neither form is given', () => {
		const { configuration } = parse();
		expect(configuration.selectiveLoad).to.equal(undefined);
		expect(configuration.transpileCache).to.equal(undefined);
		expect(configuration.watch).to.equal(undefined);
		expect(configuration.strict).to.equal(undefined);
		expect(configuration.paths).to.equal(undefined);
	});

	it('sets the paired booleans from their bare and --no- forms', () => {
		expect(parse('--selective-load').configuration.selectiveLoad).to.equal(true);
		expect(parse('--no-selective-load').configuration.selectiveLoad).to.equal(false);
		expect(parse('--transpile-cache').configuration.transpileCache).to.equal(true);
		expect(parse('--no-transpile-cache').configuration.transpileCache).to.equal(false);
		expect(parse('--watch').configuration.watch).to.equal(true);
		expect(parse('-w').configuration.watch).to.equal(true);
		expect(parse('--no-watch').configuration.watch).to.equal(false);
		expect(parse('--strict').configuration.strict).to.equal(true);
		expect(parse('--no-strict').configuration.strict).to.equal(false);
	});

	it('keeps the later of a bare and a --no- form', () => {
		expect(parse('--watch', '--no-watch').configuration.watch).to.equal(false);
		expect(parse('--no-transpile-cache', '--transpile-cache').configuration.transpileCache).to.equal(true);
	});

	it('collects positional paths into configuration.paths', () => {
		const { configuration } = parse('features/a.feature', 'features/b.feature:12');
		expect(configuration.paths).to.deep.equal(['features/a.feature', 'features/b.feature:12']);
	});

	it('separates the parser options from the configuration', () => {
		const { options, configuration } = parse('-p', 'esnode', '-p', 'tsnode', '-c', 'my.json', '--i18n-languages');
		expect(options.profile).to.deep.equal(['esnode', 'tsnode']);
		expect(options.config).to.equal('my.json');
		expect(options.i18nLanguages).to.equal(true);
		expect(configuration).to.not.have.property('profile');
		expect(configuration).to.not.have.property('config');
	});

	it('defaults the profile list to empty', () => {
		expect(parse().options.profile).to.deep.equal([]);
	});

	it('collects repeatable options in order', () => {
		const { configuration } = parse(
			'--name',
			'first',
			'--name',
			'second',
			'-r',
			'a.ts',
			'-r',
			'b.ts',
			'-f',
			'progress'
		);
		expect(configuration.name).to.deep.equal(['first', 'second']);
		expect(configuration.require).to.deep.equal(['a.ts', 'b.ts']);
		expect(configuration.format).to.deep.equal(['progress']);
	});

	it('joins repeated tag expressions with "and"', () => {
		expect(parse('-t', '@a').configuration.tags).to.equal('(@a)');
		expect(parse('-t', '@a', '--tags', '@b or @c').configuration.tags).to.equal('(@a) and (@b or @c)');
		expect(parse('--retry-tag-filter', '@flaky').configuration.retryTagFilter).to.equal('(@flaky)');
	});

	it('deep-merges repeated JSON options', () => {
		const { configuration } = parse(
			'--format-options',
			'{"a":1,"nested":{"x":1}}',
			'--format-options',
			'{"nested":{"y":2}}',
			'--world-parameters',
			'{"w":true}'
		);
		expect(configuration.formatOptions).to.deep.equal({ a: 1, nested: { x: 1, y: 2 } });
		expect(configuration.worldParameters).to.deep.equal({ w: true });
	});

	it('rejects JSON options that are not an object', () => {
		expect(() => parse('--format-options', '{not json')).to.throw('--format-options passed invalid JSON');
		expect(() => parse('--world-parameters', '[1,2]')).to.throw('--world-parameters must be passed JSON of an object');
	});

	it('parses count options and rejects anything but a non-negative integer', () => {
		expect(parse('--parallel', '3').configuration.parallel).to.equal(3);
		expect(parse('--retry', '0').configuration.retry).to.equal(0);
		expect(() => parse('--parallel', 'many')).to.throw('--parallel must be a non negative integer');
		expect(() => parse('--retry', 'x')).to.throw('--retry must be a non negative integer');
	});

	it('validates the i18n keyword language', () => {
		expect(parse('--i18n-keywords', 'en').options.i18nKeywords).to.equal('en');
		expect(() => parse('--i18n-keywords', 'xx')).to.throw('Unsupported ISO 639-1: xx');
	});

	it('accepts the removed --parallel-load flag, with or without a value, as true', () => {
		expect(parse('--parallel-load').configuration.parallelLoad).to.equal(true);
		expect(parse('--parallel-load', '4').configuration.parallelLoad).to.equal(true);
		expect(parse().configuration.parallelLoad).to.equal(undefined);
	});

	it('passes the tsflow-specific options through', () => {
		const { configuration } = parse(
			'--transpiler',
			'es-node-esm',
			'--debug-file',
			'steps.ts',
			'--experimental-decorators'
		);
		expect(configuration.transpiler).to.equal('es-node-esm');
		expect(configuration.debugFile).to.equal('steps.ts');
		expect(configuration.experimentalDecorators).to.equal(true);
	});
});

describe('ArgvParser helpers', () => {
	it('mergeTags wraps the first value and chains later ones', () => {
		expect(ArgvParser.mergeTags('@a', undefined)).to.equal('(@a)');
		expect(ArgvParser.mergeTags('@b', '(@a)')).to.equal('(@a) and (@b)');
	});

	it('validateCountOption names the option in its error', () => {
		expect(ArgvParser.validateCountOption('7', '--x')).to.equal(7);
		expect(() => ArgvParser.validateCountOption('-1', '--x')).to.throw('--x must be a non negative integer');
	});

	it('collect appends to the memo and ignores empty values', () => {
		expect(ArgvParser.collect('a')).to.deep.equal(['a']);
		expect(ArgvParser.collect('b', ['a'])).to.deep.equal(['a', 'b']);
		expect(ArgvParser.collect('', ['a'])).to.equal(undefined);
	});
});
