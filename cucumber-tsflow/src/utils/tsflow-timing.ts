/**
 * Startup timing instrumentation for cucumber-tsflow.
 *
 * Enable with: TSFLOW_TIMING=true
 *
 * Records wall-clock time per startup phase (configuration, support-code
 * require/import, registration, gherkin parsing, runtime) and per file (transpile,
 * ESM load hook, top-level require/import), then prints a report with a
 * slowest-files table when the run completes.
 *
 * Timings are collected in every execution context and aggregated in the main process:
 *
 * - the main process itself (scope `main`)
 * - the ESM loader hooks thread created by `module.register()` (scope `esm-hooks`), which
 *   reports back over a `MessageChannel` handed to the loader's `initialize` hook; loaders
 *   attached in-thread with `module.registerHooks()` record straight into the registering
 *   context's store instead (see api/register-loaders.ts)
 * - each parallel child process (scope `worker:<id>`), which sends a `TIMING` IPC message
 *   before `READY`
 *
 * State lives on `globalThis.__TSFLOW_TIMING` so that the CJS build of this module and the
 * `.mjs` twin used by the ESM loaders share one store per thread. When the mode is off every entry point is a single boolean check.
 */
import { MessageChannel, MessagePort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export type FileTimingKind = 'transpile' | 'load' | 'require' | 'import';

export interface PhaseTiming {
	name: string;
	ms: number;
	count: number;
}

export interface FileTiming {
	kind: FileTimingKind;
	file: string;
	ms: number;
}

/** Timings recorded by one execution context. */
export interface TimingSection {
	scope: string;
	phases: PhaseTiming[];
	files: FileTiming[];
}

/** Structured-clone-safe export of a store, including sections merged from other contexts. */
export interface TimingSnapshot {
	phases: PhaseTiming[];
	files: FileTiming[];
	remote: TimingSection[];
}

/** Payload passed to ESM loader `initialize` hooks via `module.register()` data. */
export interface TimingRegisterData {
	tsflowTimingPort: MessagePort;
}

interface TimingStore {
	enabled: boolean;
	phases: Map<string, PhaseTiming>;
	files: FileTiming[];
	remote: TimingSection[];
	ports: MessagePort[];
}

const SNAPSHOT_REQUEST = 'tsflow-timing:request';
const SNAPSHOT_RESPONSE = 'tsflow-timing:snapshot';
const PREFIX = '[tsflow:timing]';
const SLOWEST_FILE_COUNT = 25;

function getStore(): TimingStore {
	const g = globalThis as { __TSFLOW_TIMING?: TimingStore };
	if (!g.__TSFLOW_TIMING) {
		g.__TSFLOW_TIMING = {
			enabled: process.env.TSFLOW_TIMING === 'true',
			phases: new Map(),
			files: [],
			remote: [],
			ports: []
		};
	}
	return g.__TSFLOW_TIMING;
}

/**
 * Forget every phase and file timing recorded so far in this context (and merged from others), keeping the
 * enabled flag and the loader-hook ports. Watch mode calls this before each run so its report covers that
 * run alone.
 */
export function resetTimings(): void {
	const store = getStore();
	store.phases.clear();
	store.files.length = 0;
	store.remote.length = 0;
}

/**
 * Check if timing instrumentation is enabled
 */
export function isTimingEnabled(): boolean {
	return getStore().enabled;
}

/**
 * Start a timer. Returns 0 when timing is disabled so that the matching
 * `recordPhase` / `recordFile` call is a no-op.
 */
export function startTimer(): number {
	return getStore().enabled ? performance.now() : 0;
}

/**
 * Add the elapsed time since `start` to the named phase.
 */
export function recordPhase(name: string, start: number): void {
	const store = getStore();
	if (!store.enabled) return;
	const ms = performance.now() - start;
	const existing = store.phases.get(name);
	if (existing) {
		existing.ms += ms;
		existing.count++;
	} else {
		store.phases.set(name, { name, ms, count: 1 });
	}
}

/**
 * Record the elapsed time since `start` against a file.
 */
export function recordFile(kind: FileTimingKind, file: string, start: number): void {
	const store = getStore();
	if (!store.enabled) return;
	store.files.push({ kind, file, ms: performance.now() - start });
}

/**
 * Export this context's timings for transfer to another thread or process.
 * Returns undefined when timing is disabled.
 */
export function getTimingSnapshot(): TimingSnapshot | undefined {
	const store = getStore();
	if (!store.enabled) return undefined;
	return {
		phases: Array.from(store.phases.values()),
		files: store.files.slice(),
		remote: store.remote.slice()
	};
}

/**
 * Merge a snapshot received from another context under the given scope.
 * Sections already present for a scope are accumulated rather than duplicated.
 */
export function mergeTimingSnapshot(scope: string, snapshot: TimingSnapshot | undefined): void {
	const store = getStore();
	if (!store.enabled || !snapshot) return;
	mergeSection(store, { scope, phases: snapshot.phases, files: snapshot.files });
	for (const remote of snapshot.remote ?? []) {
		mergeSection(store, { ...remote, scope: `${scope}/${remote.scope}` });
	}
}

function mergeSection(store: TimingStore, section: TimingSection): void {
	const existing = store.remote.find(s => s.scope === section.scope);
	if (!existing) {
		store.remote.push({ scope: section.scope, phases: section.phases.slice(), files: section.files.slice() });
		return;
	}
	for (const phase of section.phases) {
		const match = existing.phases.find(p => p.name === phase.name);
		if (match) {
			match.ms += phase.ms;
			match.count += phase.count;
		} else {
			existing.phases.push({ ...phase });
		}
	}
	existing.files.push(...section.files);
}

/**
 * Options to spread into `module.register()` so the loader's `initialize` hook receives a
 * `MessagePort` for reporting hook-thread timings back to this context.
 * Returns undefined when timing is disabled, so `register(specifier, parentURL, undefined)`
 * behaves exactly as before.
 */
export function timingRegisterOptions(): { data: TimingRegisterData; transferList: MessagePort[] } | undefined {
	const store = getStore();
	if (!store.enabled) return undefined;
	const { port1, port2 } = new MessageChannel();
	port1.unref();
	store.ports.push(port1);
	return { data: { tsflowTimingPort: port2 }, transferList: [port2] };
}

/**
 * Ask every registered ESM loader hooks thread for its timings and merge them under the
 * `esm-hooks` scope. Resolves immediately when timing is disabled or no loader was
 * registered with timing options. A loader that never called `initialize` (a third-party
 * loader) is skipped after `timeoutMs`.
 */
export async function collectLoaderTimings(timeoutMs: number = 1000): Promise<void> {
	const store = getStore();
	if (!store.enabled || store.ports.length === 0) return;
	const snapshots = await Promise.all(store.ports.map(port => requestSnapshot(port, timeoutMs)));
	for (const snapshot of snapshots) {
		mergeTimingSnapshot('esm-hooks', snapshot);
	}
}

function requestSnapshot(port: MessagePort, timeoutMs: number): Promise<TimingSnapshot | undefined> {
	return new Promise(resolve => {
		const finish = (snapshot: TimingSnapshot | undefined): void => {
			clearTimeout(timer);
			port.off('message', onMessage);
			port.unref();
			resolve(snapshot);
		};
		const onMessage = (msg: { type?: string; snapshot?: TimingSnapshot }): void => {
			if (msg?.type === SNAPSHOT_RESPONSE) finish(msg.snapshot);
		};
		const timer = setTimeout(() => finish(undefined), timeoutMs);
		port.ref();
		port.on('message', onMessage);
		port.postMessage({ type: SNAPSHOT_REQUEST });
	});
}

/** Minimal writable interface accepted by `printTimingReport` (process.stderr, formatter streams). */
export interface TimingOutputStream {
	write(chunk: string): unknown;
}

/**
 * Print the timing report. No output when timing is disabled.
 */
export function printTimingReport(stream: TimingOutputStream = process.stderr): void {
	const store = getStore();
	if (!store.enabled) return;

	const lines: string[] = [];
	const main: TimingSection = { scope: 'main', phases: Array.from(store.phases.values()), files: store.files };
	const hooks = store.remote.filter(s => s.scope === 'esm-hooks');
	const workers = store.remote.filter(s => s.scope.startsWith('worker:'));

	lines.push('');
	lines.push(`Startup timing report (pid ${process.pid}, ${fmt(performance.now())} ms since process start)`);
	lines.push('');
	pushPhaseTable(lines, 'Main process', [main]);
	if (hooks.length > 0) pushPhaseTable(lines, 'Main process ESM loader hooks', hooks);
	if (workers.length > 0) {
		pushPhaseTable(lines, `Parallel worker processes (${countRoots(workers)})`, workers);
	}
	pushFamilyTable(lines, [
		['main', [main, ...hooks]],
		['workers', workers]
	]);
	pushSlowestFiles(lines, [main, ...store.remote]);

	stream.write(lines.map(l => `${PREFIX} ${l}`).join('\n') + '\n');
}

function countRoots(sections: TimingSection[]): number {
	return new Set(sections.map(s => s.scope.split('/')[0])).size;
}

function fmt(ms: number): string {
	return ms.toFixed(ms < 10 ? 1 : 0);
}

function pushPhaseTable(lines: string[], title: string, sections: TimingSection[]): void {
	const aggregate = new Map<string, { total: number; max: number; count: number }>();
	for (const section of sections) {
		for (const phase of section.phases) {
			const entry = aggregate.get(phase.name) ?? { total: 0, max: 0, count: 0 };
			entry.total += phase.ms;
			entry.max = Math.max(entry.max, phase.ms);
			entry.count += phase.count;
			aggregate.set(phase.name, entry);
		}
	}
	const multi = sections.length > 1;
	lines.push(title);
	if (aggregate.size === 0) {
		lines.push('  (no phases recorded)');
		lines.push('');
		return;
	}
	const header = multi ? ['phase', 'total ms', 'max ms', 'calls'] : ['phase', 'ms', 'calls'];
	const rows = Array.from(aggregate.entries()).map(([name, e]) =>
		multi ? [name, fmt(e.total), fmt(e.max), String(e.count)] : [name, fmt(e.total), String(e.count)]
	);
	pushTable(lines, header, rows, [false, true, true, true]);
	lines.push('');
}

function pushFamilyTable(lines: string[], families: Array<[string, TimingSection[]]>): void {
	const rows: string[][] = [];
	for (const [name, sections] of families) {
		const files = sections.flatMap(s => s.files);
		if (files.length === 0) continue;
		const sum = (kind: FileTimingKind): number =>
			files.filter(f => f.kind === kind).reduce((total, f) => total + f.ms, 0);
		const transpiled = new Set(
			files.filter(f => f.kind === 'transpile' || f.kind === 'load').map(f => normalizeFile(f.file))
		).size;
		rows.push([
			name,
			String(countRoots(sections)),
			String(transpiled),
			fmt(sum('transpile')),
			fmt(sum('load')),
			fmt(sum('require') + sum('import'))
		]);
	}
	if (rows.length === 0) return;
	lines.push('File totals by context (each context transpiles its own copy of every file it loads)');
	pushTable(lines, ['context', 'contexts', 'files', 'transpile ms', 'load ms', 'evaluate ms'], rows, [
		false,
		true,
		true,
		true,
		true,
		true
	]);
	lines.push('');
}

function pushSlowestFiles(lines: string[], sections: TimingSection[]): void {
	interface Row {
		scope: string;
		file: string;
		transpile: number;
		load: number;
		evaluate: number;
	}
	const rows = new Map<string, Row>();
	for (const section of sections) {
		for (const f of section.files) {
			const file = normalizeFile(f.file);
			const key = `${section.scope}|${file}`;
			const row = rows.get(key) ?? { scope: section.scope, file, transpile: 0, load: 0, evaluate: 0 };
			if (f.kind === 'transpile') row.transpile += f.ms;
			else if (f.kind === 'load') row.load += f.ms;
			else row.evaluate += f.ms;
			rows.set(key, row);
		}
	}
	if (rows.size === 0) return;
	const sorted = Array.from(rows.values())
		.sort((a, b) => Math.max(b.transpile, b.load, b.evaluate) - Math.max(a.transpile, a.load, a.evaluate))
		.slice(0, SLOWEST_FILE_COUNT);
	lines.push(
		`Slowest ${sorted.length} files (transpile = transpiler only, load = ESM load hook, evaluate = top-level require/import including dependencies)`
	);
	pushTable(
		lines,
		['transpile ms', 'load ms', 'evaluate ms', 'context', 'file'],
		sorted.map(r => [fmt(r.transpile), fmt(r.load), fmt(r.evaluate), r.scope, displayPath(r.file)]),
		[true, true, true, false, false]
	);
}

/**
 * Normalize a recorded file identity so every spelling of the same file shares a row:
 * the ESM hooks record file:// URLs, ts-node passes forward-slash paths, and the support
 * loader passes native paths. Case is folded on Windows where the filesystem is case-insensitive.
 */
function normalizeFile(file: string): string {
	let filePath = file;
	if (file.startsWith('file:')) {
		try {
			filePath = fileURLToPath(file);
		} catch {
			return file;
		}
	}
	const resolved = path.resolve(filePath);
	return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function displayPath(file: string): string {
	const relative = path.relative(process.cwd(), file);
	return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : file;
}

function pushTable(lines: string[], header: string[], rows: string[][], rightAlign: boolean[]): void {
	const widths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
	const render = (cells: string[]): string =>
		'  ' +
		cells
			.map((c, i) => (rightAlign[i] ? c.padStart(widths[i]) : c.padEnd(widths[i])))
			.join('  ')
			.trimEnd();
	lines.push(render(header));
	for (const row of rows) lines.push(render(row));
}
