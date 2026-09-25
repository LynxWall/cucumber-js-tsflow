import { describe, it } from 'node:test';
import { expect } from 'chai';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import support from '../../lib/api/support.js';
import supportReloader from '../../lib/api/support-reloader.js';
import type { SupportReloadSummary } from '../../lib/api/support-reloader.js';
import bindingRegistry from '../../lib/bindings/binding-registry.js';
import bindingTypes from '../../lib/bindings/types.js';
import type { StepBinding } from '../../lib/bindings/step-binding.js';
import type { Callsite } from '../../lib/utils/our-callsite.js';
import bindings from '../../lib/bindings.js';
import moduleGraph from '../../lib/utils/module-graph.js';
import paths from '../../lib/utils/paths.js';
import { temporaryDirectory } from '../helpers/temp.ts';

const { getSupportCodeLibrary } = support;
const { SupportReloader } = supportReloader;
const registry = bindingRegistry.BindingRegistry.instance;
const { StepBindingFlags } = bindingTypes;
const { recordImportEdge, versionedUrl, addReloadListener } = moduleGraph;
const { canonicalPath } = paths;
const builder = bindings.supportCodeLibraryBuilder;
type LoadOptions = Parameters<typeof getSupportCodeLibrary>[0];
const logger = { debug() {}, warn() {}, error() {} } as unknown as LoadOptions['logger'];

/**
 * The fixture modules report to the test as they evaluate, through a global, and let it stand in for what
 * their decorators would do: `register[name]` runs inside the file's recorder bracket, as a decorator would.
 */
const evaluated: string[] = [];
let register: Record<string, () => void> = {};
(globalThis as { __tsflowReloaderTest?: unknown }).__tsflowReloaderTest = {
	evaluated(name: string): void {
		evaluated.push(name);
		register[name]?.();
	}
};
const report = (name: string): string => `globalThis.__tsflowReloaderTest.evaluated('${name}');`;

const root = temporaryDirectory('support-reloader');
const file = (name: string): string => path.join(root, name);
const key = (name: string): string => canonicalPath(file(name));
writeFileSync(file('helper.cjs'), `${report('helper.cjs')} module.exports = 1;`);
writeFileSync(file('a.cjs'), `${report('a.cjs')} require('./helper.cjs');`);
writeFileSync(file('b.cjs'), `${report('b.cjs')} module.exports = 2;`);
writeFileSync(file('c.cjs'), `${report('c.cjs')} module.exports = 3;`);
writeFileSync(file('dep.mjs'), `${report('dep.mjs')} export default 1;`);
writeFileSync(file('m.mjs'), `import './dep.mjs'; ${report('m.mjs')}`);
writeFileSync(file('suite.feature'), 'Feature: watched');

let ids = 0;

/** A step binding whose decorator was applied in `source`, as the registry would see it. */
function binding(source: string): StepBinding {
	ids++;
	const callsite = {
		rawFile: source,
		rawPosition: `${source}:1:${ids}`,
		filename: source,
		lineNumber: 1
	} as unknown as Callsite;
	return {
		callsite,
		classPrototype: {},
		classPropertyKey: 'step',
		cucumberKey: `key-${ids}`,
		bindingType: StepBindingFlags.given,
		stepPattern: `step ${ids}`,
		stepFunction: undefined,
		stepIsStatic: false,
		stepArgsLength: 0
	};
}

type Reloader = InstanceType<typeof SupportReloader>;

/** The summary without the set, for comparing what `prepare()` decided. */
function counts(summary: SupportReloadSummary | undefined): Omit<SupportReloadSummary, 'files'> | undefined {
	if (!summary) return undefined;
	const { generation, reevaluated, kept, modules } = summary;
	return { generation, reevaluated, kept, modules };
}

/**
 * Load the support files as `runCucumber` does: through `getSupportCodeLibrary` with the reloader as the
 * recorder and what it decided as the set to evaluate again. Returns the modules that evaluated, in order.
 */
async function load(
	reloader: Reloader,
	summary: SupportReloadSummary | undefined,
	requirePaths: string[],
	importPaths: string[] = [],
	registrations: Record<string, () => void> = {}
): Promise<string[]> {
	evaluated.length = 0;
	register = registrations;
	await getSupportCodeLibrary({
		logger,
		cwd: root,
		newId: () => String(++ids),
		requireModules: [],
		requirePaths,
		importPaths,
		loaders: [],
		recorder: reloader,
		reevaluate: summary?.files
	});
	reloader.finish();
	return evaluated.slice();
}

describe('SupportReloader over CommonJS support files', () => {
	const reloader = new SupportReloader();
	const sources = [file('suite.feature')];
	const entries = [file('a.cjs'), file('b.cjs')];
	const withC = [...entries, file('c.cjs')];
	const registerA = (): void => registry.registerStepBinding(binding(file('a.cjs')));
	let reloads = 0;
	addReloadListener(() => reloads++);

	it('only observes on the first run', async () => {
		expect(reloader.prepare([], sources, entries, [])).to.equal(undefined);
		const ran = await load(reloader, undefined, entries, [], { 'a.cjs': registerA });
		expect(ran).to.deep.equal(['a.cjs', 'helper.cjs', 'b.cjs']);
		expect(reloads).to.equal(0);
	});

	it('re-evaluates the files that registered something and keeps the rest', async () => {
		const summary = reloader.prepare([], sources, entries, []);
		expect(counts(summary)).to.deep.equal({ generation: 1, reevaluated: 1, kept: 1, modules: 0 });
		expect(summary?.files).to.deep.equal(new Set([key('a.cjs')]));
		const ran = await load(reloader, summary, entries, [], { 'a.cjs': registerA });
		expect(ran, 'a again; its helper and b stayed loaded').to.deep.equal(['a.cjs']);
		expect(registry.getBindingSourceFiles().size, 'the registry holds only this run').to.equal(1);
		expect(reloads, 'the reload listeners ran').to.equal(1);
	});

	it('re-evaluates a changed module and everything that requires it', async () => {
		const summary = reloader.prepare([file('helper.cjs')], sources, entries, []);
		expect(counts(summary)).to.deep.equal({ generation: 2, reevaluated: 1, kept: 1, modules: 1 });
		const ran = await load(reloader, summary, entries, [], { 'a.cjs': registerA });
		expect(ran).to.deep.equal(['a.cjs', 'helper.cjs']);
	});

	it('re-evaluates a support file it has never seen', async () => {
		const summary = reloader.prepare([], sources, withC, []);
		expect(counts(summary)).to.deep.equal({ generation: 3, reevaluated: 2, kept: 1, modules: 0 });
		// c registers through the CucumberJS builder alone, with no decorator
		const ran = await load(reloader, summary, withC, [], {
			'a.cjs': registerA,
			'c.cjs': () => builder.methods.Given('plain', () => {})
		});
		expect(ran).to.deep.equal(['a.cjs', 'c.cjs']);
	});

	it('remembers a file that registered through the CucumberJS builder alone', async () => {
		const summary = reloader.prepare([], sources, withC, []);
		expect(counts(summary)).to.deep.equal({ generation: 4, reevaluated: 2, kept: 1, modules: 0 });
		const ran = await load(reloader, summary, withC, [], { 'a.cjs': registerA });
		expect(ran).to.deep.equal(['a.cjs', 'c.cjs']);
	});

	it('keeps a file once a run has observed it registering nothing', async () => {
		const summary = reloader.prepare([], sources, withC, []);
		expect(counts(summary)).to.deep.equal({ generation: 5, reevaluated: 1, kept: 2, modules: 0 });
		const ran = await load(reloader, summary, withC, [], { 'a.cjs': registerA });
		expect(ran).to.deep.equal(['a.cjs']);
	});

	it('re-evaluates on every run a module that applied decorators without being a support file', async () => {
		const first = reloader.prepare([], sources, withC, []);
		const helperDecorates = (): void => {
			registerA();
			registry.registerStepBinding(binding(file('helper.cjs')));
		};
		await load(reloader, first, withC, [], { 'a.cjs': helperDecorates });
		const summary = reloader.prepare([], sources, withC, []);
		expect(counts(summary)).to.deep.equal({ generation: 7, reevaluated: 1, kept: 2, modules: 1 });
		const ran = await load(reloader, summary, withC, [], { 'a.cjs': registerA });
		expect(ran).to.deep.equal(['a.cjs', 'helper.cjs']);
	});

	it('notices a binding registered after the load at the start of the next run', async () => {
		// A module required by a scenario, say, registers while the run executes
		registry.registerStepBinding(binding(file('late.cjs')));
		const summary = reloader.prepare([], sources, withC, []);
		expect(counts(summary)).to.deep.equal({ generation: 8, reevaluated: 1, kept: 2, modules: 2 });
		await load(reloader, summary, withC, [], { 'a.cjs': registerA });
	});

	it('forgets the files of a failed load so the next run evaluates them again', async () => {
		const changed = reloader.prepare([file('b.cjs')], sources, withC, []);
		expect(changed?.reevaluated, 'a and the changed b').to.equal(2);
		reloader.beginFile(file('b.cjs'), 'require');
		reloader.abort();
		const next = reloader.prepare([], sources, withC, []);
		expect(next?.reevaluated, 'b is unknown again after the failed load').to.equal(2);
		await load(reloader, next, withC, [], { 'a.cjs': registerA });
		const settled = reloader.prepare([], sources, withC, []);
		expect(settled?.reevaluated).to.equal(1);
		await load(reloader, settled, withC, [], { 'a.cjs': registerA });
	});

	it('watches the features, the support files and every project module loaded so far', () => {
		const watched = new Set(reloader.watchedFiles());
		for (const name of ['suite.feature', 'a.cjs', 'b.cjs', 'c.cjs', 'helper.cjs']) {
			expect(watched.has(key(name)), name).to.equal(true);
		}
	});
});

describe('SupportReloader over ES module support files', () => {
	it('versions the modules to evaluate again so that their next import is a URL Node has not seen', async () => {
		const reloader = new SupportReloader();
		const entry = file('m.mjs');
		const dependency = file('dep.mjs');
		const url = (f: string): string => pathToFileURL(f).href;
		const registerM = (): void => registry.registerStepBinding(binding(entry));
		// Bindings the CommonJS tests left in the registry would count as decorator-applying modules here
		registry.clear();
		expect(reloader.prepare([], [], [], [entry])).to.equal(undefined);
		// What the in-thread resolve hook records while the entry evaluates; no hook runs in this process
		recordImportEdge(url(entry), url(dependency));
		let ran = await load(reloader, undefined, [], [entry], { 'm.mjs': registerM });
		expect(ran, 'a static import evaluates before its importer').to.deep.equal(['dep.mjs', 'm.mjs']);

		const summary = reloader.prepare([dependency], [], [], [entry]);
		expect(counts(summary)).to.deep.equal({ generation: 1, reevaluated: 1, kept: 0, modules: 1 });
		ran = await load(reloader, summary, [], [entry], { 'm.mjs': registerM });
		// The entry was imported under its new URL; its static import of the dependency is resolved by Node
		// alone here, without the resolve hook that would apply the dependency's version
		expect(ran).to.deep.equal(['m.mjs']);
		const versioned = versionedUrl(url(entry));
		expect(versioned).to.match(/\?tsflow=\d+$/);
		const version = Number(versioned.slice(versioned.lastIndexOf('=') + 1));
		expect(versionedUrl(url(dependency))).to.equal(`${url(dependency)}?tsflow=${version}`);

		const next = reloader.prepare([], [], [], [entry]);
		expect(next?.generation).to.equal(2);
		await load(reloader, next, [], [entry], { 'm.mjs': registerM });
		expect(versionedUrl(url(entry))).to.equal(`${url(entry)}?tsflow=${version + 1}`);
		// A module keeps the version of the last run that evaluated it; that URL is the instance in Node's map
		expect(versionedUrl(url(dependency)), 'the dependency did not change this time').to.equal(
			`${url(dependency)}?tsflow=${version}`
		);
	});

	it('cannot reload in place when a loader runs on the hooks thread', () => {
		const coordinates = { requireModules: [], requirePaths: [], importPaths: [], loaders: [] };
		expect(SupportReloader.unsupportedReason(coordinates)).to.equal(undefined);
		const loaders = ['@lynxwall/cucumber-tsflow/lib/transpilers/esm/vue-loader'];
		// A built-in loader is named as the load phase names it; anything else by its specifier
		expect(SupportReloader.unsupportedReason({ ...coordinates, loaders })).to.include('the ts-vue-esm loader');
		expect(SupportReloader.unsupportedReason({ ...coordinates, loaders: ['ts-node-maintained/esm'] })).to.include(
			'the ts-node-maintained/esm loader'
		);
	});
});
