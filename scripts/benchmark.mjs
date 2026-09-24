#!/usr/bin/env node
/**
 * Startup benchmark for cucumber-tsflow.
 *
 * Runs the `bench` profile of one spec workspace under `TSFLOW_TIMING=true` several times and prints the
 * startup phases that matter side by side, so a change to loading, transpiling or registration can be judged
 * on this repository alone. Not a CI gate: the numbers depend on the machine. See
 * docs/performance-and-diagnostics.md, "Measuring startup on this repository".
 *
 *   node scripts/benchmark.mjs [--workspace node|node-esm|vue|vue-esm] [--profile bench] [--runs 3] [--cold] [--report]
 *
 * `--cold` gives run 1 an empty transpile cache and an empty Node compile cache (both in a temporary directory
 * that the later runs then share), so one table shows a cold run followed by warm ones. Without it every run uses
 * the project's own caches. `--report` prints the full timing report of the last run after the table.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repoRoot, 'cucumber-tsflow', 'bin', 'cucumber-tsflow.js');
const workspaces = ['node', 'node-esm', 'vue', 'vue-esm'];

/** The phases shown in the table, in order, with the column header for each. */
const columns = [
	['total', 'total'],
	['bootstrap', 'bootstrap'],
	['config', 'config'],
	['gherkin', 'gherkin'],
	['support:require-modules', 'req-modules'],
	['support:require', 'require'],
	['support:import', 'import'],
	['registry:update', 'registry'],
	['formatters:init', 'formatters'],
	['runtime:run', 'run'],
	['transpile-cache:hit', 'cache hits'],
	['transpile-cache:miss', 'cache misses']
];
/** Phases whose `calls` column is the figure, not their time. */
const counted = new Set(['transpile-cache:hit', 'transpile-cache:miss']);

const options = parseArguments(process.argv.slice(2));
const workspaceDirectory = path.join(repoRoot, 'cucumber-tsflow-specs', options.workspace);

if (!existsSync(path.join(repoRoot, 'cucumber-tsflow', 'lib', 'index.js'))) {
	fail('The library is not built. Run `yarn build` first.');
}
if (!existsSync(workspaceDirectory)) {
	fail(`No spec workspace at ${workspaceDirectory}.`);
}

let temporaryRoot;
const environment = { ...process.env, TSFLOW_TIMING: 'true', TSFLOW_THEME: 'off', FORCE_COLOR: '0' };
if (options.cold) {
	temporaryRoot = mkdtempSync(path.join(tmpdir(), 'cucumber-tsflow-bench-'));
	environment.TSFLOW_TRANSPILE_CACHE_DIR = path.join(temporaryRoot, 'transpile');
	environment.NODE_COMPILE_CACHE = path.join(temporaryRoot, 'compile');
}

console.log(
	`Benchmarking cucumber-tsflow-${options.workspace}, profile "${options.profile}", ${options.runs} run(s)` +
		(options.cold ? ' (run 1 cold: empty transpile and compile caches)' : ' (project caches)') +
		` on Node ${process.version}`
);

const results = [];
let lastReport = '';
try {
	for (let run = 1; run <= options.runs; run++) {
		const started = performance.now();
		const child = spawnSync(process.execPath, [cli, '-p', options.profile], {
			cwd: workspaceDirectory,
			env: environment,
			encoding: 'utf8',
			maxBuffer: 64 * 1024 * 1024
		});
		const wall = performance.now() - started;
		const stderr = child.stderr ?? '';
		if (child.status !== 0) {
			console.error(child.stdout);
			console.error(stderr);
			fail(`Run ${run} exited with code ${child.status}.`);
		}
		const report = stderr
			.split(/\r?\n/)
			.filter(line => line.startsWith('[tsflow:timing]'))
			.map(line => line.slice('[tsflow:timing]'.length).replace(/^ /, ''));
		if (report.length === 0) {
			console.error(stderr);
			fail(`Run ${run} printed no timing report.`);
		}
		lastReport = report.join('\n');
		results.push({ run, wall, ...parseMainProcess(report) });
	}
} finally {
	if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true });
}

printTable(results);
if (options.report) {
	console.log('');
	console.log(lastReport);
}

/**
 * Read the "Main process" phase table of a report into `{ total, phases }`, where `total` is the milliseconds
 * since process start from the report header and `phases` maps a phase name to its time or, for the counted
 * phases, its `calls`.
 */
function parseMainProcess(lines) {
	const header = lines.find(line => line.startsWith('Startup timing report'));
	const total = header ? Number(/, (\d+) ms since process start/.exec(header)?.[1]) : NaN;
	const phases = {};
	let inMain = false;
	for (const line of lines) {
		if (line === 'Main process') {
			inMain = true;
			continue;
		}
		if (inMain) {
			if (line.trim() === '' || /^\S/.test(line)) break;
			const match = /^\s+(\S+)\s+([\d.]+)\s+(\d+)\s*$/.exec(line);
			if (!match || match[1] === 'phase') continue;
			const [, phase, ms, calls] = match;
			phases[phase] = counted.has(phase) ? Number(calls) : Number(ms);
		}
	}
	return { total, phases };
}

function printTable(rows) {
	const headers = ['run', 'wall', ...columns.map(([, label]) => label)];
	const cells = rows.map(row => [
		String(row.run),
		formatMs(row.wall),
		...columns.map(([phase]) => {
			if (phase === 'total') return formatMs(row.total);
			const value = row.phases[phase];
			if (value === undefined) return '-';
			return counted.has(phase) ? String(value) : formatMs(value);
		})
	]);
	const widths = headers.map((header, index) => Math.max(header.length, ...cells.map(row => row[index].length)));
	const line = row => row.map((cell, index) => cell.padStart(widths[index])).join('  ');
	console.log('');
	console.log(line(headers));
	console.log(widths.map(width => '-'.repeat(width)).join('  '));
	for (const row of cells) console.log(line(row));
	console.log('');
	console.log(
		'wall = whole process as seen by this script; total = ms since process start as the report measures it; ' +
			'phases in ms; cache hits and misses are counts'
	);
}

function formatMs(value) {
	if (!Number.isFinite(value)) return '-';
	return value >= 100 ? String(Math.round(value)) : value.toFixed(1);
}

function parseArguments(argv) {
	const parsed = { workspace: 'node', profile: 'bench', runs: 3, cold: false, report: false };
	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		const next = () => {
			const value = argv[++index];
			if (value === undefined) fail(`${argument} needs a value.`);
			return value;
		};
		switch (argument) {
			case '--workspace':
			case '-w':
				parsed.workspace = next();
				break;
			case '--profile':
			case '-p':
				parsed.profile = next();
				break;
			case '--runs':
			case '-n':
				parsed.runs = Number(next());
				break;
			case '--cold':
				parsed.cold = true;
				break;
			case '--report':
				parsed.report = true;
				break;
			case '--help':
			case '-h':
				console.log(
					'usage: node scripts/benchmark.mjs [--workspace node|node-esm|vue|vue-esm] [--profile bench] [--runs 3] [--cold] [--report]'
				);
				process.exit(0);
				break;
			default:
				fail(`Unknown argument ${argument}.`);
		}
	}
	if (!workspaces.includes(parsed.workspace)) fail(`--workspace must be one of ${workspaces.join(', ')}.`);
	if (!Number.isInteger(parsed.runs) || parsed.runs < 1) fail('--runs must be a positive integer.');
	return parsed;
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
