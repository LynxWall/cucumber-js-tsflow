#!/usr/bin/env node
/**
 * Packed-tarball smoke test for @lynxwall/cucumber-tsflow.
 *
 * Packs the library workspace the way `npm publish` would, checks what the tarball contains, installs it into a
 * fresh CommonJS project and a fresh ESM project under the OS temp directory, and runs one feature in each with
 * the installed `cucumber-tsflow` command, then type-checks each project with the repository's TypeScript. This
 * is the only check of the package as a consumer sees it: the `files` list, the `exports` map, the `bin`, the
 * `api/` and `bindings/` declaration stubs and the shipped agent skill.
 *
 *   node scripts/smoke-test-tarball.mjs [--keep]
 *
 * `--keep` leaves the temporary projects in place and prints their paths. Needs a built library (`yarn build`),
 * `yarn` and `npm` on the PATH, and network access for `npm install` to fetch the dependencies.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageDirectory = path.join(repoRoot, 'cucumber-tsflow');
const keep = process.argv.includes('--keep');
const failures = [];

if (!existsSync(path.join(packageDirectory, 'lib', 'index.js'))) {
	fail('The library is not built. Run `yarn build` first.');
}

const workDirectory = mkdtempSync(path.join(tmpdir(), 'cucumber-tsflow-smoke-'));
const tarball = path.join(workDirectory, 'cucumber-tsflow.tgz');

try {
	step('Packing the workspace');
	run('yarn', ['workspace', '@lynxwall/cucumber-tsflow', 'pack', '--out', tarball], { cwd: repoRoot });
	if (!existsSync(tarball)) fail(`yarn pack produced no tarball at ${tarball}.`);

	step('Checking the tarball contents');
	checkContents(listTarball(tarball));

	step('CommonJS project: install, run one feature, type-check');
	consumerProject('cjs', {
		type: undefined,
		transpiler: 'es-node',
		supportKey: 'require',
		moduleResolution: 'node',
		module: 'commonjs'
	});

	step('ESM project: install, run one feature, type-check');
	consumerProject('esm', {
		type: 'module',
		transpiler: 'es-node-esm',
		supportKey: 'import',
		moduleResolution: 'bundler',
		module: 'esnext'
	});
} finally {
	if (keep) {
		console.log(`\nKept ${workDirectory}`);
	} else {
		rmSync(workDirectory, { recursive: true, force: true });
	}
}

if (failures.length > 0) {
	console.error(`\n${failures.length} check(s) failed:`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}
console.log('\nThe packed tarball runs a feature in a fresh CommonJS project and a fresh ESM project.');

/**
 * Every path in the tarball (prefixed `package/`), read with Node rather than `tar`, whose Git for Windows build
 * treats a `C:` path as a remote host. Handles ustar prefixes, GNU long names and PAX `path` records.
 */
function listTarball(file) {
	const data = gunzipSync(readFileSync(file));
	const entries = [];
	let offset = 0;
	let pendingName;
	while (offset + 512 <= data.length) {
		const header = data.subarray(offset, offset + 512);
		if (header.every(byte => byte === 0)) break;
		const field = (start, length) => header.toString('utf8', start, start + length).replace(/\0.*$/s, '');
		const size = parseInt(field(124, 12).trim() || '0', 8);
		const type = field(156, 1);
		const body = data.subarray(offset + 512, offset + 512 + size);
		let name = field(0, 100);
		const prefix = field(345, 155);
		if (prefix) name = `${prefix}/${name}`;
		if (type === 'L') {
			pendingName = body.toString('utf8').replace(/\0.*$/s, '');
		} else if (type === 'x' || type === 'g') {
			const record = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'));
			if (record) pendingName = record[1];
		} else {
			entries.push(pendingName ?? name);
			pendingName = undefined;
		}
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	return entries.filter(entry => !entry.endsWith('/'));
}

/**
 * Every compiled file under `lib/` must come from a source file that still exists: `tsc --build` never removes
 * the output of a deleted or renamed source, and a stale file in `lib/` ships with the package.
 */
function checkStaleOutputs(entries) {
	const stale = [];
	for (const entry of entries) {
		const relative = entry.replace(/^package\/lib\//, '');
		if (relative === entry || relative.endsWith('.tsbuildinfo')) continue;
		const base = relative.replace(/\.(d\.ts|js\.map|js|mjs|cjs)$/, '');
		const candidates = ['.ts', '.mts', '.cts', '.mjs', '.cjs'].map(extension =>
			path.join(packageDirectory, 'src', base + extension)
		);
		if (!candidates.some(candidate => existsSync(candidate))) stale.push(entry);
	}
	check(stale.length === 0, `every file under lib/ has a source file (stale: ${stale.join(', ') || 'none'})`);
}

function checkContents(entries) {
	const required = [
		'package/package.json',
		'package/README.md',
		'package/CHANGELOG.md',
		'package/LICENSE',
		'package/bin/cucumber-tsflow.js',
		'package/api/index.d.ts',
		'package/bindings/index.d.ts',
		'package/lib/index.js',
		'package/lib/index.d.ts',
		'package/lib/bindings.js',
		'package/lib/bindings.mjs',
		'package/lib/wrapper.mjs',
		'package/lib/api/index.js',
		'package/lib/api/wrapper.mjs',
		'package/lib/transpilers/esm/esnode-loader.mjs',
		'package/lib/transpilers/esm/esvue-loader.mjs',
		'package/lib/transpilers/esm/tsnode-loader.mjs',
		'package/lib/transpilers/esm/vue-loader.mjs',
		'package/lib/utils/startup-progress-worker.js',
		'package/skills/cucumber-tsflow/SKILL.md',
		'package/skills/cucumber-tsflow/references/bindings-and-context.md',
		'package/skills/cucumber-tsflow/references/configuration.md',
		'package/skills/cucumber-tsflow/references/running-and-debugging.md',
		'package/skills/cucumber-tsflow/references/migrating-from-cucumber.md'
	];
	for (const entry of required) {
		check(entries.includes(entry), `tarball contains ${entry}`);
	}
	// Development-only content that must not ship. Yarn always packs README files, so the ESM loaders' README
	// under src/ is allowed; everything else under src/ and test/ is not.
	const forbidden = entries.filter(
		entry =>
			/^package\/(test|node_modules|\.yarn)\//.test(entry) ||
			(/^package\/src\//.test(entry) && !/README\.md$/.test(entry)) ||
			/^package\/(tsconfig[^/]*\.json|\.eslintrc.*|eslint\.config\.\w+|tsconfig\.tsbuildinfo)$/.test(entry) ||
			/\.test\.(ts|js|mjs)$/.test(entry)
	);
	check(forbidden.length === 0, `tarball ships nothing development-only (found: ${forbidden.join(', ') || 'none'})`);
	checkStaleOutputs(entries);
	const libFiles = entries.filter(entry => entry.startsWith('package/lib/')).length;
	console.log(`  ${entries.length} entries, ${libFiles} under lib/`);
}

/**
 * Create a consumer project of one module system, install the tarball into it, write a feature with a step class
 * and a context class, run it with the installed CLI, and type-check it with the repository's TypeScript.
 */
function consumerProject(name, settings) {
	const projectDirectory = path.join(workDirectory, name);
	mkdirSync(path.join(projectDirectory, 'features', 'step_definitions'), { recursive: true });
	mkdirSync(path.join(projectDirectory, 'features', 'support'), { recursive: true });

	writeJson(path.join(projectDirectory, 'package.json'), {
		name: `cucumber-tsflow-smoke-${name}`,
		private: true,
		version: '0.0.0',
		...(settings.type ? { type: settings.type } : {})
	});
	writeJson(path.join(projectDirectory, 'cucumber.json'), {
		default: {
			transpiler: settings.transpiler,
			paths: ['features/**/*.feature'],
			[settings.supportKey]: ['features/step_definitions/**/*.ts', 'features/support/**/*.ts'],
			format: ['progress']
		}
	});
	writeJson(path.join(projectDirectory, 'tsconfig.json'), {
		compilerOptions: {
			target: 'es2022',
			module: settings.module,
			moduleResolution: settings.moduleResolution,
			lib: ['es2022', 'esnext.decorators'],
			experimentalDecorators: false,
			strict: true,
			esModuleInterop: true,
			skipLibCheck: true,
			noEmit: true,
			types: ['node']
		},
		include: ['features/**/*.ts']
	});
	writeFileSync(
		path.join(projectDirectory, 'features', 'smoke.feature'),
		[
			'Feature: Packed tarball smoke test',
			'',
			'  Scenario: Adding two numbers through an injected context',
			'    Given I enter 2 and 8',
			'    When I add them',
			'    Then the result is 10',
			''
		].join('\n')
	);
	writeFileSync(
		path.join(projectDirectory, 'features', 'support', 'calculator-context.ts'),
		[
			"import type { EndTestCaseInfo, StartTestCaseInfo, World } from '@lynxwall/cucumber-tsflow/bindings';",
			'',
			'export class CalculatorContext {',
			'	public operands: number[] = [];',
			'	public result = 0;',
			'	public initialized = false;',
			'',
			'	constructor(public world: World) {}',
			'',
			'	public initialize(_info: StartTestCaseInfo): void {',
			'		this.initialized = true;',
			'	}',
			'',
			'	public dispose(_info: EndTestCaseInfo): void {',
			'		this.operands = [];',
			'	}',
			'}',
			''
		].join('\n')
	);
	writeFileSync(
		path.join(projectDirectory, 'features', 'step_definitions', 'calculator-steps.ts'),
		[
			"import { binding, given, then, when } from '@lynxwall/cucumber-tsflow/bindings';",
			"import { CalculatorContext } from '../support/calculator-context';",
			'',
			'@binding([CalculatorContext])',
			'export default class CalculatorSteps {',
			'	constructor(private calculator: CalculatorContext) {}',
			'',
			"	@given('I enter {int} and {int}')",
			'	enter(first: number, second: number): void {',
			"		if (!this.calculator.initialized) throw new Error('the context was not initialized');",
			'		this.calculator.operands = [first, second];',
			'	}',
			'',
			"	@when('I add them')",
			'	add(): void {',
			'		this.calculator.result = this.calculator.operands.reduce((sum, value) => sum + value, 0);',
			'	}',
			'',
			"	@then('the result is {int}')",
			'	result(expected: number): void {',
			'		if (this.calculator.result !== expected) {',
			'			throw new Error(`expected ${expected}, got ${this.calculator.result}`);',
			'		}',
			'	}',
			'}',
			''
		].join('\n')
	);

	console.log('  npm install (fetches the dependencies from the registry)');
	run('npm', ['install', '--no-audit', '--no-fund', '--no-package-lock', '--loglevel', 'error', tarball], {
		cwd: projectDirectory
	});
	const installed = path.join(projectDirectory, 'node_modules', '@lynxwall', 'cucumber-tsflow');
	check(existsSync(path.join(installed, 'skills', 'cucumber-tsflow', 'SKILL.md')), `${name}: the skill is installed`);
	check(existsSync(path.join(installed, 'bindings', 'index.d.ts')), `${name}: bindings/index.d.ts is installed`);

	console.log('  cucumber-tsflow -p default');
	const output = spawnSync(process.execPath, [path.join(installed, 'bin', 'cucumber-tsflow.js'), '-p', 'default'], {
		cwd: projectDirectory,
		env: { ...process.env, TSFLOW_THEME: 'off', FORCE_COLOR: '0' },
		encoding: 'utf8'
	});
	const passed = output.status === 0 && /1 scenario \(1 passed\)/.test(output.stdout ?? '');
	check(passed, `${name}: the feature runs and passes (exit code ${output.status})`);
	if (!passed) {
		console.error(output.stdout);
		console.error(output.stderr);
	}

	console.log('  tsc --noEmit');
	const tsc = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
	const typecheck = spawnSync(process.execPath, [tsc, '-p', path.join(projectDirectory, 'tsconfig.json')], {
		cwd: projectDirectory,
		encoding: 'utf8'
	});
	check(
		typecheck.status === 0,
		`${name}: the step and context files type-check (moduleResolution ${settings.moduleResolution})`
	);
	if (typecheck.status !== 0) console.error(typecheck.stdout);
}

function run(command, args, { cwd, capture = false }) {
	// yarn and npm are .cmd shims on Windows, so go through the shell, as one command line (Node warns when an
	// argument array meets `shell: true`). Only paths can carry spaces; quote those.
	const commandLine = [command, ...args.map(argument => (/\s/.test(argument) ? `"${argument}"` : argument))].join(' ');
	const result = spawnSync(commandLine, {
		cwd,
		shell: true,
		encoding: 'utf8',
		stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
		maxBuffer: 64 * 1024 * 1024
	});
	if (result.status !== 0) fail(`${commandLine} exited with code ${result.status}.`);
	return result.stdout ?? '';
}

function check(condition, description) {
	console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${description}`);
	if (!condition) failures.push(description);
}

function step(title) {
	console.log(`\n${title}`);
}

function writeJson(file, value) {
	writeFileSync(file, `${JSON.stringify(value, null, '\t')}\n`);
}

function fail(message) {
	console.error(message);
	if (!keep && existsSync(workDirectory)) rmSync(workDirectory, { recursive: true, force: true });
	process.exit(1);
}
