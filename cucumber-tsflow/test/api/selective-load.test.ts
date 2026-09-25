import { describe, it } from 'node:test';
import { expect } from 'chai';
import { appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Pickle } from '@cucumber/messages';
import selectiveLoad from '../../lib/api/selective-load.js';
import bindingRegistry from '../../lib/bindings/binding-registry.js';
import bindingTypes from '../../lib/bindings/types.js';
import type { StepBinding } from '../../lib/bindings/step-binding.js';
import bindings from '../../lib/bindings.js';
import callsites from '../../lib/utils/our-callsite.js';
import { temporaryDirectory } from '../helpers/temp.ts';

const { SelectiveLoadSession, literalPrefix, storedPattern, patternKey } = selectiveLoad;
const registry = bindingRegistry.BindingRegistry.instance;
const { StepBindingFlags } = bindingTypes;
const { Callsite } = callsites;
const builder = bindings.supportCodeLibraryBuilder;
const { methods } = builder;

const root = temporaryDirectory('selective-load');
const indexDirectory = path.join(root, 'index');
const cwd = path.join(root, 'project');
const coordinates = { requireModules: [], requirePaths: ['./steps/**/*.ts'], importPaths: [], loaders: [] };
const support = (name: string): string => path.join(cwd, 'steps', `${name}.ts`);
mkdirSync(path.join(cwd, 'steps'), { recursive: true });
for (const name of ['a', 'b', 'c', 'd', 'f', 'g', 'h']) writeFileSync(support(name), `// support file ${name}\n`);

let ids = 0;
const newId = (): string => String(++ids);

/** A step binding as a decorator would register it. */
function binding(pattern: string | RegExp, bindingType = StepBindingFlags.given): StepBinding {
	return {
		callsite: Callsite.capture(),
		classPrototype: {},
		classPropertyKey: 'step',
		cucumberKey: `key-${++ids}`,
		bindingType,
		stepPattern: pattern,
		stepFunction: undefined,
		stepIsStatic: false,
		stepArgsLength: 0
	};
}

/** What each support file registers while it evaluates, by base name. A missing entry registers nothing. */
const registrations: Record<string, () => void> = {
	a: () => registry.registerStepBinding(binding('I have {int} cucumbers')),
	b: () => {
		// A global regexp keeps its lastIndex between tests; the matcher must reset it
		registry.registerStepBinding(binding(/^I eat (\d+) cucumbers$/g));
		methods.Given('a plain step', () => {});
	},
	c: () => registry.registerStepBinding(binding('', StepBindingFlags.before)),
	f: () => registry.registerStepBinding(binding('I fly {int} km')),
	g: () => registry.registerStepBinding(binding('I use {mystery}')),
	h: () => registry.registerStepBinding(binding('I pick a {shade} cucumber'))
};

function pickles(...texts: string[]): Pickle[] {
	return texts.map(text => ({ steps: [{ text }] }) as unknown as Pickle);
}

interface RunOptions {
	/** Define the `shade` parameter type in the library the run finishes with */
	shade?: boolean;
	index?: string;
}

/** One run: the plan for `texts` over the files `names`, the loads the plan asks for, and the index write. */
function run(names: string[], texts: string[], { shade = false, index = indexDirectory }: RunOptions = {}) {
	builder.reset(cwd, newId, coordinates);
	registry.clear();
	const session = new SelectiveLoadSession(cwd, coordinates, false, names.map(support), [], index);
	const plan = session.plan(pickles(...texts));
	for (const file of plan.requirePaths) {
		session.beginFile(file, 'require');
		registrations[path.basename(file, '.ts')]?.();
		session.endFile();
	}
	if (shade) methods.defineParameterType({ name: 'shade', regexp: /red|green/, transformer: (text: string) => text });
	session.finish(builder.finalize());
	return { plan, loaded: plan.requirePaths.map(file => path.basename(file, '.ts')) };
}

const files = ['a', 'b', 'c', 'd', 'f'];

describe('SelectiveLoadSession', () => {
	it('loads everything on the first run and writes the index', () => {
		const { plan, loaded } = run(files, ['I have 3 cucumbers']);
		expect(plan.reason).to.equal('no index yet; this run writes it');
		expect(plan.skipped).to.equal(0);
		expect(loaded).to.deep.equal(files);
		expect(readdirSync(indexDirectory)).to.have.length(1);
	});

	it('loads the files whose patterns match, plus every file that registered more than steps or nothing at all', () => {
		const { plan, loaded } = run(files, ['I have 3 cucumbers']);
		expect(plan.reason).to.equal(undefined);
		// a matches; c registered a hook; d registered nothing (a set-up file); b and f are skipped
		expect(loaded).to.deep.equal(['a', 'c', 'd']);
		expect(plan.skipped).to.equal(2);
	});

	it('matches regular expressions, including a global one against several texts', () => {
		expect(run(files, ['I eat 2 cucumbers', 'I eat 3 cucumbers']).loaded).to.deep.equal(['b', 'c', 'd']);
	});

	it('sees steps registered straight with CucumberJS, without a decorator', () => {
		expect(run(files, ['a plain step']).loaded).to.deep.equal(['b', 'c', 'd']);
	});

	it('loads everything when the selected scenarios need every file', () => {
		const { plan } = run(files, ['I have 1 cucumbers', 'I eat 2 cucumbers', 'I fly 5 km']);
		expect(plan.reason).to.equal('every support file is needed by the selected scenarios');
		expect(plan.skipped).to.equal(0);
	});

	it('loads everything when a selected step matches no indexed pattern, so the undefined step is reported', () => {
		const { plan } = run(files, ['I have 3 cucumbers', 'I teleport']);
		expect(plan.reason).to.equal('"I teleport" matches no step definition in the index');
		expect(plan.skipped).to.equal(0);
	});

	it('loads a file that is new to the index', () => {
		const { loaded, plan } = run([...files, 'g'], ['I have 3 cucumbers']);
		expect(loaded).to.deep.equal(['a', 'c', 'd', 'g']);
		expect(plan.skipped).to.equal(2);
	});

	it('loads a file whose indexed pattern cannot be compiled', () => {
		// g is indexed now, with a pattern that names an undefined parameter type
		expect(run([...files, 'g'], ['I have 3 cucumbers']).loaded).to.deep.equal(['a', 'c', 'd', 'g']);
	});

	it('loads a file whose import graph changed since it was indexed, then trusts the rewritten record', () => {
		appendFileSync(support('b'), '// edited\n');
		const changed = run(files, ['I have 3 cucumbers']);
		expect(changed.loaded).to.deep.equal(['a', 'b', 'c', 'd']);
		expect(changed.plan.skipped).to.equal(1);
		const settled = run(files, ['I have 3 cucumbers']);
		expect(settled.loaded).to.deep.equal(['a', 'c', 'd']);
	});

	it('keeps the record of a file it skipped', () => {
		// f was last evaluated several runs ago and has been skipped since
		expect(run(files, ['I fly 5 km']).loaded).to.deep.equal(['c', 'd', 'f']);
	});

	it('compiles patterns with the parameter types the index recorded', () => {
		const withH = [...files, 'h'];
		run(withH, ['I have 3 cucumbers'], { shade: true });
		expect(run(withH, ['I pick a red cucumber'], { shade: true }).loaded).to.deep.equal(['c', 'd', 'h']);
		expect(run(withH, ['I have 3 cucumbers'], { shade: true }).loaded).to.deep.equal(['a', 'c', 'd']);
	});

	it('ignores an unreadable index and rebuilds it', () => {
		const [name] = readdirSync(indexDirectory);
		writeFileSync(path.join(indexDirectory, name), '{"v":1,"files":"garbage"');
		expect(run(files, ['I have 3 cucumbers']).plan.reason).to.equal('no index yet; this run writes it');
		expect(run(files, ['I have 3 cucumbers']).loaded).to.deep.equal(['a', 'c', 'd']);
	});

	it('writes nothing when the load is aborted', () => {
		const index = path.join(root, 'aborted');
		builder.reset(cwd, newId, coordinates);
		const session = new SelectiveLoadSession(cwd, coordinates, false, files.map(support), [], index);
		session.plan(pickles('I have 3 cucumbers'));
		session.beginFile(support('a'), 'require');
		registrations.a();
		session.abort();
		expect(existsSync(index)).to.equal(false);
	});

	it('is unavailable for a loader that runs on the hooks thread', () => {
		const loaders = ['@lynxwall/cucumber-tsflow/lib/transpilers/esm/tsnode-loader'];
		// A built-in loader is named as the load phase names it; anything else by its specifier
		expect(SelectiveLoadSession.unsupportedReason({ ...coordinates, loaders })).to.include('the ts-node-esm loader');
		expect(SelectiveLoadSession.unsupportedReason({ ...coordinates, loaders: ['ts-node-maintained/esm'] })).to.include(
			'the ts-node-maintained/esm loader'
		);
		expect(SelectiveLoadSession.unsupportedReason(coordinates)).to.equal(undefined);
	});
});

describe('literalPrefix', () => {
	const cases: Array<[string | RegExp, string]> = [
		['I have {int} cucumbers', 'I have '],
		['I eat cucumber(s)', 'I eat cucumber'],
		['I like apples/pears', 'I like '],
		['a \\{ brace', 'a '],
		['plain text', 'plain text'],
		[/^I have (\d+)/, 'I have '],
		[/I have/, ''],
		[/^abc?/, 'ab'],
		[/^ab+c/, 'a'],
		[/^ab*c/, 'a'],
		[/^ab{2}/, 'a'],
		[/^a|b/, ''],
		[/^abc/i, ''],
		[/^ab\d/, 'ab'],
		[/^ab.c/, 'ab'],
		[/^abc$/, 'abc'],
		[/^a[bc]/, 'a']
	];

	for (const [pattern, prefix] of cases) {
		it(`${String(pattern)} -> ${JSON.stringify(prefix)}`, () => {
			expect(literalPrefix(storedPattern(pattern))).to.equal(prefix);
		});
	}

	it('never excludes a text the pattern matches', () => {
		const matching: Array<[string | RegExp, string]> = [
			['I eat cucumber(s)', 'I eat cucumbers'],
			['I eat cucumber(s)', 'I eat cucumber'],
			['I like apples/pears', 'I like pears'],
			[/^abc?/, 'ab'],
			[/^ab+c/, 'abbc'],
			[/^ab*c/, 'ac'],
			[/^ab{2}/, 'abb'],
			[/^a|b/, 'b'],
			[/^abc/i, 'ABC']
		];
		for (const [pattern, text] of matching) {
			expect(text.startsWith(literalPrefix(storedPattern(pattern))), `${String(pattern)} vs ${text}`).to.equal(true);
		}
	});
});

describe('storedPattern and patternKey', () => {
	it('stores a Cucumber expression with null flags and a regexp with its flags', () => {
		expect(storedPattern('I have {int}')).to.deep.equal(['I have {int}', null]);
		expect(storedPattern(/I have/gi)).to.deep.equal(['I have', 'gi']);
		expect(storedPattern(/I have/)).to.deep.equal(['I have', '']);
	});

	it('gives a regexp and a Cucumber expression with the same text different keys', () => {
		expect(patternKey(storedPattern(/I have/))).to.not.equal(patternKey(storedPattern('I have')));
		expect(patternKey(storedPattern(/I have/i))).to.not.equal(patternKey(storedPattern(/I have/)));
		expect(patternKey(storedPattern('I have'))).to.equal(patternKey(storedPattern('I have')));
	});
});
