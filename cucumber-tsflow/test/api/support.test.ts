import 'polyfill-symbol-metadata';
import { describe, it } from 'node:test';
import { expect } from 'chai';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import support from '../../lib/api/support.js';
import bindingRegistry from '../../lib/bindings/binding-registry.js';
import moduleGraph from '../../lib/utils/module-graph.js';
import paths from '../../lib/utils/paths.js';

const require = createRequire(import.meta.url);
// The es-node transpiler setting: ts-node with the esbuild transpiler, as a require hook for .ts files
require('../../lib/transpilers/esnode.js');

const { getSupportCodeLibrary, composeRecorders } = support;
const { addReloadListener, versionedUrl } = moduleGraph;
const { canonicalPath } = paths;
const registry = bindingRegistry.BindingRegistry.instance;
const fixtures = path.join(import.meta.dirname, '..', 'fixtures', 'support');
const files = ['steps-a.ts', 'steps-b.ts'].map(name => path.join(fixtures, name));
type LoadOptions = Parameters<typeof getSupportCodeLibrary>[0];
const logger = { debug() {}, warn() {}, error() {} } as unknown as LoadOptions['logger'];
let ids = 0;

function load(options: Pick<LoadOptions, 'recorder' | 'reevaluate'> = {}) {
	return getSupportCodeLibrary({
		logger,
		cwd: fixtures,
		newId: () => String(++ids),
		requireModules: [],
		requirePaths: files,
		importPaths: [],
		loaders: [],
		...options
	});
}

function patterns(library: Awaited<ReturnType<typeof load>>): string[] {
	return library.stepDefinitions.map(definition => String(definition.pattern)).sort();
}

const parameterTypeNames = (library: Awaited<ReturnType<typeof load>>): string[] =>
	Array.from(library.parameterTypeRegistry.parameterTypes).map(type => type.name ?? '');

// The tests run in order: the first load in this process is the one a fresh process makes, every later one
// finds the support files in Node's module cache
describe('getSupportCodeLibrary', () => {
	it('loads decorated bindings, hooks, parameter types and settings from TypeScript support files', async () => {
		const library = await load();
		expect(patterns(library)).to.deep.equal(['I pick a {shade} cucumber', 'a step from file a', 'a tagged step']);
		expect(library.beforeTestCaseHookDefinitions).to.have.length(1);
		expect(parameterTypeNames(library)).to.include.members(['boolean', 'shade']);
		expect(library.defaultTimeout).to.equal(5000);
		expect(registry.getBindingSourceFiles().size).to.equal(2);
	});

	it('lets the registry patch the CucumberJS definitions with the decorator callsites', async () => {
		// The raw library names the decorator module as every definition's location; the registry corrects it
		const library = registry.updateSupportCodeLibrary(await load());
		expect(library.stepDefinitions).to.have.length(3);
		for (const definition of library.stepDefinitions) {
			expect(definition.uri, String(definition.pattern)).to.match(/steps-[ab]\.ts$/);
			expect(definition.line, String(definition.pattern)).to.be.greaterThan(0);
		}
	});

	it('evaluates every support file again on a later load, and forgets the bindings of the previous one', async () => {
		const first = await load();
		const before = registry.getStepBindings('a step from file a', ['*']);
		expect(before).to.have.length(1);

		const second = await load();
		expect(patterns(second)).to.deep.equal(patterns(first));
		expect(second.beforeTestCaseHookDefinitions).to.have.length(1);
		expect(
			parameterTypeNames(second).filter(name => name === 'boolean'),
			'boolean defined once'
		).to.have.length(1);
		expect(parameterTypeNames(second).filter(name => name === 'shade')).to.have.length(1);
		expect(second.defaultTimeout).to.equal(5000);
		expect(second.stepDefinitions).to.not.equal(first.stepDefinitions);
		// The class the second evaluation defined is the one bound now, not the first one's under the same pattern
		const after = registry.getStepBindings('a step from file a', ['*']);
		expect(after).to.have.length(1);
		expect(after[0].classPrototype).to.not.equal(before[0].classPrototype);
		expect(registry.getBindingSourceFiles().size).to.equal(2);
	});

	it('evaluates again only the modules the caller names, keeping the rest loaded', async () => {
		await load();
		const library = await load({ reevaluate: new Set([canonicalPath(files[0])]) });
		expect(patterns(library), 'file b stayed loaded and registered nothing').to.deep.equal([
			'a step from file a',
			'a tagged step'
		]);
		expect(library.beforeTestCaseHookDefinitions).to.have.length(1);
		expect(parameterTypeNames(library)).to.not.include('shade');
		expect(registry.getBindingSourceFiles().size).to.equal(1);
	});

	it('versions the modules it makes evaluate again and runs the reload listeners, on every load after the first', async () => {
		let reloads = 0;
		const remove = addReloadListener(() => reloads++);
		const url = pathToFileURL(files[0]).href;
		await load();
		expect(reloads).to.equal(1);
		const versioned = versionedUrl(url);
		expect(versioned).to.match(/\?tsflow=\d+$/);
		const version = Number(versioned.slice(versioned.lastIndexOf('=') + 1));
		await load();
		expect(reloads).to.equal(2);
		expect(versionedUrl(url)).to.equal(`${url}?tsflow=${version + 1}`);
		remove();
	});

	it('brackets every support file with the recorder', async () => {
		const events: string[] = [];
		let open = '';
		const recorder = {
			beginFile: (file: string, kind: string) => {
				open = `${kind} ${path.basename(file)}`;
				events.push(`begin ${open}`);
			},
			endFile: () => void events.push(`end ${open}`)
		};
		await load({ recorder });
		expect(events).to.deep.equal([
			'begin require steps-a.ts',
			'end require steps-a.ts',
			'begin require steps-b.ts',
			'end require steps-b.ts'
		]);
	});
});

describe('composeRecorders', () => {
	it('returns undefined for no recorders and the recorder itself for one', () => {
		const one = { beginFile() {}, endFile() {} };
		expect(composeRecorders()).to.equal(undefined);
		expect(composeRecorders(undefined, undefined)).to.equal(undefined);
		expect(composeRecorders(undefined, one)).to.equal(one);
	});

	it('forwards to every recorder in order', () => {
		const calls: string[] = [];
		const make = (name: string) => ({
			beginFile: (file: string) => void calls.push(`${name} begin ${file}`),
			endFile: () => void calls.push(`${name} end`)
		});
		const composed = composeRecorders(make('x'), undefined, make('y'))!;
		composed.beginFile('f', 'require');
		composed.endFile();
		expect(calls).to.deep.equal(['x begin f', 'y begin f', 'x end', 'y end']);
	});
});
