import { describe, it } from 'node:test';
import { expect } from 'chai';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import supportReloader from '../../lib/api/support-reloader.js';
import bindingRegistry from '../../lib/bindings/binding-registry.js';
import bindingTypes from '../../lib/bindings/types.js';
import type { StepBinding } from '../../lib/bindings/step-binding.js';
import type { Callsite } from '../../lib/utils/our-callsite.js';
import bindings from '../../lib/bindings.js';
import moduleGraph from '../../lib/utils/module-graph.js';
import { temporaryDirectory } from '../helpers/temp.ts';

const { SupportReloader } = supportReloader;
const registry = bindingRegistry.BindingRegistry.instance;
const { StepBindingFlags } = bindingTypes;
const { canonicalPath, recordImportEdge, versionedUrl, addReloadListener } = moduleGraph;
const builder = bindings.supportCodeLibraryBuilder;
const require = createRequire(import.meta.url);

const root = temporaryDirectory('support-reloader');
const file = (name: string): string => path.join(root, name);
const key = (name: string): string => canonicalPath(file(name));
writeFileSync(file('helper.cjs'), 'module.exports = 1;');
writeFileSync(file('a.cjs'), "require('./helper.cjs');");
writeFileSync(file('b.cjs'), 'module.exports = 2;');
writeFileSync(file('c.cjs'), 'module.exports = 3;');
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

const cached = (name: string): boolean => Object.keys(require.cache).some(k => canonicalPath(k) === key(name));

type Reloader = InstanceType<typeof SupportReloader>;

/**
 * Evaluate `paths` the way `getSupportCodeLibrary` does: the builder reset, then each file required inside
 * its recorder bracket, with `register` standing in for what the file's decorators do when it evaluates.
 */
function load(reloader: Reloader, paths: string[], register: Record<string, () => void> = {}): void {
	builder.reset(root, () => String(++ids), { requireModules: [], requirePaths: [], importPaths: [], loaders: [] });
	for (const p of paths) {
		reloader.beginFile(p, 'require');
		require(p);
		register[path.basename(p)]?.();
		reloader.endFile();
	}
	reloader.finish();
}

describe('SupportReloader over CommonJS support files', () => {
	const reloader = new SupportReloader();
	const sources = [file('suite.feature')];
	const entries = [file('a.cjs'), file('b.cjs')];
	const withC = [...entries, file('c.cjs')];
	const registerA = (): void => registry.registerStepBinding(binding(file('a.cjs')));
	let reloads = 0;
	addReloadListener(() => reloads++);

	it('only observes on the first run', () => {
		expect(reloader.prepare([], sources, entries, [])).to.equal(undefined);
		load(reloader, entries, { 'a.cjs': registerA });
		expect(cached('a.cjs') && cached('b.cjs') && cached('helper.cjs')).to.equal(true);
		expect(reloads).to.equal(0);
	});

	it('re-evaluates the files that registered something and keeps the rest', () => {
		const summary = reloader.prepare([], sources, entries, []);
		expect(summary).to.deep.equal({ generation: 1, reevaluated: 1, kept: 1, modules: 0 });
		expect(cached('a.cjs')).to.equal(false);
		expect(cached('b.cjs')).to.equal(true);
		expect(cached('helper.cjs')).to.equal(true);
		expect(registry.getBindingSourceFiles().size, 'the registry was cleared').to.equal(0);
		expect(reloads, 'the reload listeners ran').to.equal(1);
		load(reloader, entries, { 'a.cjs': registerA });
	});

	it('re-evaluates a changed module and everything that requires it', () => {
		const summary = reloader.prepare([file('helper.cjs')], sources, entries, []);
		expect(summary).to.deep.equal({ generation: 2, reevaluated: 1, kept: 1, modules: 1 });
		expect(cached('helper.cjs')).to.equal(false);
		expect(cached('a.cjs')).to.equal(false);
		expect(cached('b.cjs')).to.equal(true);
		load(reloader, entries, { 'a.cjs': registerA });
	});

	it('re-evaluates a support file it has never seen', () => {
		const summary = reloader.prepare([], sources, withC, []);
		expect(summary).to.deep.equal({ generation: 3, reevaluated: 2, kept: 1, modules: 0 });
		// c registers through the CucumberJS builder alone, with no decorator
		load(reloader, withC, { 'a.cjs': registerA, 'c.cjs': () => builder.methods.Given('plain', () => {}) });
	});

	it('remembers a file that registered through the CucumberJS builder alone', () => {
		const summary = reloader.prepare([], sources, withC, []);
		expect(summary).to.deep.equal({ generation: 4, reevaluated: 2, kept: 1, modules: 0 });
		load(reloader, withC, { 'a.cjs': registerA });
	});

	it('keeps a file once a run has observed it registering nothing', () => {
		const summary = reloader.prepare([], sources, withC, []);
		expect(summary).to.deep.equal({ generation: 5, reevaluated: 1, kept: 2, modules: 0 });
		load(reloader, withC, { 'a.cjs': registerA });
	});

	it('re-evaluates on every run a module that applied decorators without being a support file', () => {
		reloader.prepare([], sources, withC, []);
		const helperDecorates = (): void => {
			registerA();
			registry.registerStepBinding(binding(file('helper.cjs')));
		};
		load(reloader, withC, { 'a.cjs': helperDecorates });
		const summary = reloader.prepare([], sources, withC, []);
		expect(summary).to.deep.equal({ generation: 7, reevaluated: 1, kept: 2, modules: 1 });
		expect(cached('helper.cjs')).to.equal(false);
		load(reloader, withC, { 'a.cjs': registerA });
	});

	it('notices a binding registered after the load at the start of the next run', () => {
		// A module required by a scenario, say, registers while the run executes
		registry.registerStepBinding(binding(file('late.cjs')));
		const summary = reloader.prepare([], sources, withC, []);
		expect(summary).to.deep.equal({ generation: 8, reevaluated: 1, kept: 2, modules: 2 });
		load(reloader, withC, { 'a.cjs': registerA });
	});

	it('forgets the files of a failed load so the next run evaluates them again', () => {
		const changed = reloader.prepare([file('b.cjs')], sources, withC, []);
		expect(changed?.reevaluated, 'a and the changed b').to.equal(2);
		reloader.beginFile(file('b.cjs'), 'require');
		reloader.abort();
		const next = reloader.prepare([], sources, withC, []);
		expect(next?.reevaluated, 'b is unknown again after the failed load').to.equal(2);
		load(reloader, withC, { 'a.cjs': registerA });
		const settled = reloader.prepare([], sources, withC, []);
		expect(settled?.reevaluated).to.equal(1);
		load(reloader, withC, { 'a.cjs': registerA });
	});

	it('watches the features, the support files and every project module loaded so far', () => {
		const watched = new Set(reloader.watchedFiles());
		for (const name of ['suite.feature', 'a.cjs', 'b.cjs', 'c.cjs', 'helper.cjs']) {
			expect(watched.has(key(name)), name).to.equal(true);
		}
	});
});

describe('SupportReloader over ES module support files', () => {
	it('versions the modules to evaluate again so that their next import is a URL Node has not seen', () => {
		const reloader = new SupportReloader();
		const entry = file('m.mjs');
		const dependency = file('dep.mjs');
		const url = (f: string): string => pathToFileURL(f).href;
		// Bindings the CommonJS tests left in the registry would count as decorator-applying modules here
		registry.clear();
		expect(reloader.prepare([], [], [], [entry])).to.equal(undefined);
		// What the in-thread resolve hook records while the entry evaluates
		recordImportEdge(url(entry), url(dependency));
		reloader.beginFile(entry, 'import');
		registry.registerStepBinding(binding(entry));
		reloader.endFile();
		reloader.finish();

		const summary = reloader.prepare([dependency], [], [], [entry]);
		expect(summary).to.deep.equal({ generation: 1, reevaluated: 1, kept: 0, modules: 1 });
		expect(versionedUrl(url(entry))).to.equal(`${url(entry)}?tsflow=1`);
		expect(versionedUrl(url(dependency))).to.equal(`${url(dependency)}?tsflow=1`);

		reloader.beginFile(entry, 'import');
		registry.registerStepBinding(binding(entry));
		reloader.endFile();
		reloader.finish();
		expect(reloader.prepare([], [], [], [entry])?.generation).to.equal(2);
		expect(versionedUrl(url(entry))).to.equal(`${url(entry)}?tsflow=2`);
		// A module keeps the version of the last run that evaluated it; that URL is the instance in Node's map
		expect(versionedUrl(url(dependency)), 'the dependency did not change this time').to.equal(
			`${url(dependency)}?tsflow=1`
		);
	});

	it('cannot reload in place when a loader runs on the hooks thread', () => {
		const coordinates = { requireModules: [], requirePaths: [], importPaths: [], loaders: [] };
		expect(SupportReloader.unsupportedReason(coordinates)).to.equal(undefined);
		const loaders = ['@lynxwall/cucumber-tsflow/lib/transpilers/esm/vue-loader'];
		expect(SupportReloader.unsupportedReason({ ...coordinates, loaders })).to.include('vue-loader');
	});
});
