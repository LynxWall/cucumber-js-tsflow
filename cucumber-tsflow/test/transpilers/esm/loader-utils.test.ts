import { describe, it } from 'node:test';
import { expect } from 'chai';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as loaderUtils from '../../../lib/transpilers/esm/loader-utils.mjs';
import moduleGraph from '../../../lib/utils/module-graph.js';
import { temporaryDirectory } from '../../helpers/temp.ts';

const {
	isRequire,
	resolveWithExtensions,
	clearResolutionCaches,
	resolveTsconfigPaths,
	handleCommonFileTypes,
	loadTypeScript,
	shouldEnableVueStyle,
	createEsbuildLoader
} = loaderUtils;
const { canonicalPath, importedProjectModules, bumpModuleVersions } = moduleGraph;

const root = temporaryDirectory('loader-utils');
// Transpiles in this file go through the on-disk cache; keep them out of the project's cache
process.env.TSFLOW_TRANSPILE_CACHE_DIR = path.join(root, 'cache');

const project = path.join(root, 'project');
mkdirSync(path.join(project, 'pkg'), { recursive: true });
const file = (name: string): string => path.join(project, name);
const url = (name: string): string => pathToFileURL(file(name)).href;
writeFileSync(file('mod.ts'), 'export const n: number = 1;\n');
writeFileSync(file('pkg/index.mjs'), 'export default 1;\n');
writeFileSync(file('data.json'), '{"a":1}');
writeFileSync(file('logo.png'), 'not really a png');
writeFileSync(file('plain.js'), 'export default 2;\n');
const parent = url('parent.mts');

describe('isRequire', () => {
	it('recognizes a require() call by its condition', () => {
		expect(isRequire({ conditions: ['node', 'require'] })).to.equal(true);
		expect(isRequire({ conditions: ['node', 'import'] })).to.equal(false);
		expect(isRequire({})).to.equal(false);
		expect(isRequire(undefined)).to.equal(false);
	});
});

describe('resolveWithExtensions', () => {
	it('probes the code extensions, then index files', () => {
		expect(resolveWithExtensions('./mod', parent)).to.equal(url('mod.ts'));
		expect(resolveWithExtensions('./pkg', parent)).to.equal(url('pkg/index.mjs'));
		expect(resolveWithExtensions(url('mod'), parent)).to.equal(url('mod.ts'));
		expect(resolveWithExtensions('./missing', parent)).to.equal(null);
	});

	it('takes another extension list', () => {
		expect(resolveWithExtensions('./data', parent, ['.json'])).to.equal(url('data.json'));
		expect(resolveWithExtensions('./data', parent)).to.equal(null);
	});

	it('caches the probes, including a miss, until the caches are cleared', () => {
		expect(resolveWithExtensions('./later', parent)).to.equal(null);
		writeFileSync(file('later.ts'), 'export {};\n');
		expect(resolveWithExtensions('./later', parent), 'still the cached miss').to.equal(null);
		clearResolutionCaches();
		expect(resolveWithExtensions('./later', parent)).to.equal(url('later.ts'));
	});
});

describe('resolveTsconfigPaths', () => {
	it('never maps relative, absolute, file: or node: specifiers', () => {
		for (const specifier of ['./x', '../x', '/x', 'file:///x', 'node:fs']) {
			expect(resolveTsconfigPaths(specifier), specifier).to.equal(null);
		}
	});
});

describe('handleCommonFileTypes', () => {
	it('turns an asset into a module exporting its path', () => {
		expect(handleCommonFileTypes(url('logo.png'))).to.deep.equal({
			format: 'module',
			source: `export default ${JSON.stringify(file('logo.png'))};`,
			shortCircuit: true
		});
	});

	it('reads JSON with the json format', () => {
		expect(handleCommonFileTypes(url('data.json'))).to.deep.equal({
			format: 'json',
			source: '{"a":1}',
			shortCircuit: true
		});
	});

	it('leaves code alone', () => {
		expect(handleCommonFileTypes(url('mod.ts'))).to.equal(null);
		expect(handleCommonFileTypes(url('plain.js'))).to.equal(null);
	});
});

describe('loadTypeScript', () => {
	it('transpiles the module and keeps its source map for callsite resolution', () => {
		const result = loadTypeScript(url('mod.ts'));
		expect(result.format).to.equal('module');
		expect(result.shortCircuit).to.equal(true);
		expect(result.source).to.include('const n = 1');
		expect(result.source).to.not.include(': number');
		const maps = (globalThis as { __CUCUMBER_TSFLOW_SOURCE_MAPS?: Map<string, string> }).__CUCUMBER_TSFLOW_SOURCE_MAPS;
		expect(JSON.parse(maps?.get(url('mod.ts')) ?? '{}').version).to.equal(3);
	});
});

describe('shouldEnableVueStyle', () => {
	it('reads the global set by loadConfiguration or the environment', () => {
		const globals = globalThis as { enableVueStyle?: boolean };
		delete process.env.CUCUMBER_ENABLE_VUE_STYLE;
		delete process.env.enableVueStyle;
		globals.enableVueStyle = false;
		expect(shouldEnableVueStyle()).to.equal(false);
		globals.enableVueStyle = true;
		expect(shouldEnableVueStyle()).to.equal(true);
		globals.enableVueStyle = false;
		process.env.CUCUMBER_ENABLE_VUE_STYLE = 'true';
		expect(shouldEnableVueStyle()).to.equal(true);
		delete process.env.CUCUMBER_ENABLE_VUE_STYLE;
	});
});

describe('createEsbuildLoader hooks', () => {
	const { resolve, load } = createEsbuildLoader({ loaderName: 'test' });
	const importing = { parentURL: parent, conditions: ['node', 'import'] };
	const requiring = { parentURL: parent, conditions: ['node', 'require'] };

	function next() {
		const calls: unknown[][] = [];
		const fn = (...args: unknown[]) => {
			calls.push(args);
			return { url: 'next://resolved', format: 'module', shortCircuit: true, source: 'next' };
		};
		return { calls, fn };
	}

	it('hands every require() straight to the default loader', () => {
		const resolveNext = next();
		resolve('./mod', requiring, resolveNext.fn);
		expect(resolveNext.calls).to.deep.equal([['./mod', requiring]]);
		const loadNext = next();
		load(url('mod.ts'), requiring, loadNext.fn);
		expect(loadNext.calls).to.deep.equal([[url('mod.ts'), requiring]]);
	});

	it('resolves extensionless relative imports itself and delegates the rest', () => {
		const own = next();
		expect(resolve('./mod', importing, own.fn)).to.deep.equal({
			url: url('mod.ts'),
			format: 'module',
			shortCircuit: true
		});
		expect(own.calls).to.deep.equal([]);
		const delegated = next();
		expect(resolve('node:fs', importing, delegated.fn).url).to.equal('next://resolved');
		expect(delegated.calls).to.have.length(1);
	});

	it('records the import edge for selective loading', () => {
		expect(importedProjectModules(fileURLToPath(parent))).to.include(canonicalPath(file('mod.ts')));
	});

	it('applies the version watch mode gave a module and judges the extension without the query', () => {
		bumpModuleVersions([canonicalPath(file('mod.ts'))], 3);
		expect(resolve('./mod', importing, next().fn).url).to.equal(`${url('mod.ts')}?tsflow=3`);
		const result = load(`${url('mod.ts')}?tsflow=3`, importing, next().fn);
		expect(result.format).to.equal('module');
		expect(result.source).to.include('const n = 1');
	});

	it('loads TypeScript and assets itself and delegates other files', () => {
		expect(load(url('mod.ts'), importing, next().fn).source).to.include('const n = 1');
		expect(load(url('logo.png'), importing, next().fn).source).to.include('logo.png');
		const other = next();
		expect(load(url('plain.js'), importing, other.fn).source).to.equal('next');
		expect(other.calls).to.have.length(1);
	});
});
