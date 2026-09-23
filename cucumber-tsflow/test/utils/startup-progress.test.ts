import { describe, it } from 'node:test';
import { expect } from 'chai';
import startupProgress from '../../lib/utils/startup-progress.js';
import type { SpinnerWorkerCommand, SpinnerWorkerData, SpinnerWorkerHandle } from '../../lib/utils/startup-progress.js';

const { PhaseRenderer, StartupProgress, resolveStartupTheme, describeTranspiler, plural, DEFAULT_COLUMNS } =
	startupProgress;
const theme = resolveStartupTheme('pickle')!;

const CURSOR_UP = (rows: number): string => `\x1b[${rows}A`;
const REDRAW_PREFIX = (rows: number): string => `${CURSOR_UP(rows)}\x1b[1G\x1b[0J`;

/** `text` without its escape sequences, so assertions do not depend on whether ansis is coloring. */
function strip(text: string): string {
	// eslint-disable-next-line no-control-regex
	return text.replace(/\x1b\[[\d;?]*[ -/]*[@-~]/g, '');
}

function renderer(mode: 'tty' | 'plain', columns = DEFAULT_COLUMNS) {
	const writes: string[] = [];
	let now = 0;
	const instance = new PhaseRenderer(
		text => writes.push(text),
		theme,
		mode,
		() => columns,
		() => now
	);
	return {
		renderer: instance,
		writes,
		advance: (ms: number): void => {
			now += ms;
		},
		last: (): string => strip(writes.at(-1) ?? '')
	};
}

describe('PhaseRenderer in plain mode', () => {
	it('writes nothing of its own until a message or the end', () => {
		const { renderer: r, writes } = renderer('plain');
		r.start('resolve', 'globs', 10);
		r.tick();
		r.pump();
		expect(writes).to.deep.equal([]);
	});

	it('shows the waiting text once the phase has been silent for 30 s with nothing completed', () => {
		const { renderer: r, writes, advance, last } = renderer('plain');
		r.start('resolve', undefined, 10);
		advance(29_999);
		r.pump();
		expect(writes).to.deep.equal([]);
		advance(1);
		r.pump();
		expect(last()).to.equal(' still at it, 30.0s so far');
	});

	it('rotates the quips once work has completed, 30 s after the previous message', () => {
		const { renderer: r, writes, advance, last } = renderer('plain');
		r.start('resolve', undefined, 10);
		r.tick();
		r.tick();
		r.tick();
		advance(30_000);
		r.pump();
		expect(last()).to.equal(' 3 of 10 done, 30.0s in');
		advance(29_999);
		r.pump();
		expect(writes).to.have.length(1);
		advance(1);
		r.pump();
		expect(last()).to.equal(' still going: 3 down, 7 to go');
		advance(30_000);
		r.pump();
		expect(last()).to.equal(' 3 of 10 done, 1m 30s in');
	});

	it('uses the texts of a phase that has its own', () => {
		const { renderer: r, advance, last } = renderer('plain');
		r.start('load', undefined, 5);
		advance(30_000);
		r.pump();
		expect(last()).to.include('still packing the first jar');
		r.tick();
		advance(30_000);
		r.pump();
		expect(last()).to.equal(' whoa, that is a lot of jars. 1 packed so far, 4 to go');
	});

	it('shows relief only once five quick units follow a stall, and starts the count again after a slow one', () => {
		const { renderer: r, writes, advance, last } = renderer('plain');
		r.start('load', undefined, 20);
		r.tick();
		advance(30_000);
		r.tick();
		for (let i = 0; i < 4; i++) {
			advance(500);
			r.tick();
		}
		expect(writes, 'four quick units are not enough').to.deep.equal([]);
		advance(1_500);
		r.tick();
		for (let i = 0; i < 4; i++) {
			advance(500);
			r.tick();
		}
		expect(writes, 'the slow unit started the count again').to.deep.equal([]);
		advance(500);
		r.tick();
		expect(last()).to.equal(' phew, that was a big jar. Back to the quick ones');
		expect(writes).to.have.length(1);

		advance(30_000);
		r.tick();
		for (let i = 0; i < 5; i++) {
			advance(100);
			r.tick();
		}
		expect(last(), 'the next relief message in the rotation').to.equal(
			' that one fought back. All right, we are back on track'
		);
	});

	it('does not show relief after a stall that no quick run follows', () => {
		const { renderer: r, writes, advance } = renderer('plain');
		r.start('load', undefined, 20);
		r.tick();
		advance(30_000);
		r.tick();
		advance(30_000);
		r.tick();
		expect(writes).to.deep.equal([]);
	});

	it('ends with the closing text on its own line', () => {
		const { renderer: r, writes } = renderer('plain');
		r.start('resolve', 'globs', 10);
		r.end('12 files, 1.2s');
		expect(writes.map(strip)).to.deep.equal([' 12 files, 1.2s\n']);
		r.tick();
		r.pump();
		expect(writes).to.have.length(1);
	});
});

describe('PhaseRenderer in tty mode', () => {
	it('redraws the block from the row after it on start', () => {
		const { renderer: r, writes, last } = renderer('tty');
		r.start('resolve', 'globs', 10);
		expect(writes).to.have.length(1);
		expect(writes[0].startsWith(REDRAW_PREFIX(1))).to.equal(true);
		expect(last()).to.equal('[ | ] Prepping the cucumbers — globs (0/10)\r\n');
	});

	it('advances the spinner every 130 ms', () => {
		const { renderer: r, writes, advance, last } = renderer('tty');
		r.start('resolve', undefined, undefined);
		advance(129);
		r.pump();
		expect(writes).to.have.length(1);
		for (const glyph of ['/', '-', '\\', '|']) {
			advance(130);
			r.pump();
			expect(last()).to.equal(`[ ${glyph} ] Prepping the cucumbers\r\n`);
		}
	});

	it('counts completed units, with or without a known total', () => {
		const known = renderer('tty');
		known.renderer.start('resolve', undefined, 3);
		known.renderer.tick();
		expect(known.last()).to.equal('[ | ] Prepping the cucumbers (1/3)\r\n');

		const unknown = renderer('tty');
		unknown.renderer.start('resolve', undefined, undefined);
		expect(unknown.last()).to.equal('[ | ] Prepping the cucumbers\r\n');
		unknown.renderer.tick();
		expect(unknown.last()).to.equal('[ | ] Prepping the cucumbers (1)\r\n');
	});

	it('puts messages on a second line that clears itself after 8 s but stays open', () => {
		const { renderer: r, writes, advance, last } = renderer('tty');
		// The spinner keeps turning while the clock advances, so the glyph is not part of the comparison
		const block = (): string => last().replace(/^\[ . \]/, '[ ? ]');
		r.start('resolve', undefined, 10);
		advance(30_000);
		r.pump();
		expect(block()).to.equal('[ ? ] Prepping the cucumbers (0/10)\r\nstill at it, 30.0s so far\r\n');
		advance(7_999);
		r.pump();
		expect(block()).to.include('still at it');
		expect(writes.at(-1)?.startsWith(REDRAW_PREFIX(2)), 'the block is two rows now').to.equal(true);
		advance(1);
		r.pump();
		expect(block()).to.equal('[ ? ] Prepping the cucumbers (0/10)\r\n\r\n');
	});

	it('moves up by the rows the block occupied at the current width', () => {
		const { renderer: r, writes } = renderer('tty', 10);
		r.start('resolve', 'a detail that wraps', 10);
		// '[ | ] Prepping the cucumbers — a detail that wraps (0/10)' is 55 cells: 6 rows at 10 columns
		expect(writes[0].startsWith(REDRAW_PREFIX(1)), 'the opening line was counted at the same width').to.equal(false);
		r.tick();
		expect(writes[1].startsWith(REDRAW_PREFIX(6))).to.equal(true);
	});

	it('ends with the check mark and the closing text in place of the block', () => {
		const { renderer: r, writes, last } = renderer('tty');
		r.start('resolve', 'globs', 10);
		r.end('12 files, 1.2s');
		expect(writes.at(-1)?.startsWith(REDRAW_PREFIX(1))).to.equal(true);
		expect(last()).to.equal('[ ✓ ] Prepping the cucumbers — globs 12 files, 1.2s\r\n');
	});
});

describe('PhaseRenderer static helpers', () => {
	it('counts the rows a line occupies, two cells per emoji and none per escape sequence', () => {
		expect(PhaseRenderer.rows('abc', 120)).to.equal(1);
		expect(PhaseRenderer.rows('a'.repeat(120), 120)).to.equal(1);
		expect(PhaseRenderer.rows('a'.repeat(121), 120)).to.equal(2);
		expect(PhaseRenderer.rows('🔥'.repeat(60), 119)).to.equal(2);
		expect(PhaseRenderer.rows('\x1b[31mab\x1b[0m', 2)).to.equal(1);
		expect(PhaseRenderer.rows('', 80)).to.equal(1);
		expect(PhaseRenderer.rows('abc', 0)).to.equal(3);
	});

	it('builds the opening line with a spinner and counter only on a terminal', () => {
		expect(strip(PhaseRenderer.openingLine(theme, 'load', 'x', 3, false))).to.equal('Packing the jars — x');
		expect(strip(PhaseRenderer.openingLine(theme, 'load', 'x', 3, true))).to.equal('[ | ] Packing the jars — x (0/3)');
		expect(strip(PhaseRenderer.openingLine(theme, 'load', undefined, undefined, true))).to.equal(
			'[ | ] Packing the jars'
		);
		expect(strip(PhaseRenderer.closingLine(theme, 'load', 'x', 'done'))).to.equal('[ ✓ ] Packing the jars — x done');
	});
});

interface FakeStream {
	writes: string[];
	write: (chunk: string) => void;
	isTTY?: boolean;
	fd?: number;
	columns?: number;
}

function stream(isTTY: boolean, fd?: number): FakeStream {
	const writes: string[] = [];
	return { writes, write: chunk => void writes.push(chunk), isTTY, fd, columns: 100 };
}

function clock() {
	let now = 0;
	return {
		now: () => now,
		advance: (ms: number): void => {
			now += ms;
		}
	};
}

describe('StartupProgress', () => {
	it('does nothing at all when the theme is off', () => {
		const s = stream(true, 1);
		const progress = new StartupProgress(s, resolveStartupTheme('off'));
		expect(progress.enabled).to.equal(false);
		progress.begin('resolve', 'x', 1);
		progress.tick();
		progress.end('done');
		progress.finish();
		expect(s.writes).to.deep.equal([]);
	});

	it('appends the phase line, the closing text and a blank line on a plain stream', () => {
		const s = stream(false);
		const time = clock();
		const progress = new StartupProgress(s, theme, { now: time.now });
		progress.begin('resolve', 'globs');
		expect(s.writes.map(strip)).to.deep.equal(['Prepping the cucumbers — globs']);
		time.advance(250);
		progress.end('2 files');
		expect(s.writes.map(strip)).to.deep.equal(['Prepping the cucumbers — globs', ' 2 files, 250ms\n']);
		progress.begin('assemble', 'parsing', 3);
		progress.finish();
		expect(s.writes.map(strip).slice(2)).to.deep.equal(['Making the brine — parsing', ' 0ms\n', '\n']);
		progress.finish();
		expect(s.writes).to.have.length(5);
	});

	it('ends an open phase before beginning the next', () => {
		const s = stream(false);
		const progress = new StartupProgress(s, theme, { now: () => 0 });
		progress.begin('resolve');
		progress.begin('assemble');
		expect(s.writes.map(strip)).to.deep.equal(['Prepping the cucumbers', ' 0ms\n', 'Making the brine']);
	});

	it('renders in-thread on a terminal without a file descriptor', () => {
		const s = stream(true);
		const progress = new StartupProgress(s, theme, { now: () => 0 });
		progress.begin('resolve', undefined, 2);
		expect(s.writes.map(strip)).to.deep.equal([
			'[ | ] Prepping the cucumbers (0/2)\r\n',
			'[ | ] Prepping the cucumbers (0/2)\r\n'
		]);
		expect(s.writes[1].startsWith(REDRAW_PREFIX(1))).to.equal(true);
		progress.tick();
		expect(strip(s.writes.at(-1)!)).to.equal('[ | ] Prepping the cucumbers (1/2)\r\n');
		progress.end('done');
		expect(strip(s.writes.at(-1)!)).to.equal('[ ✓ ] Prepping the cucumbers done, 0ms\r\n');
	});

	interface FakeWorker extends SpinnerWorkerHandle {
		posted: SpinnerWorkerCommand[];
		terminated: boolean;
	}

	/** A stand-in for the spinner thread that records commands and, when `answers`, completes the end handshake. */
	function fakeWorker(answers: boolean) {
		const created: Array<{ script: string; data: SpinnerWorkerData; worker: FakeWorker }> = [];
		const createWorker = (script: string, data: SpinnerWorkerData): SpinnerWorkerHandle => {
			const flag = new Int32Array(data.signal);
			const worker: FakeWorker = {
				posted: [],
				terminated: false,
				postMessage(command) {
					worker.posted.push(command);
					if (command.type === 'end' && answers) {
						Atomics.store(flag, 0, 1);
						Atomics.notify(flag, 0);
					}
				},
				on() {},
				unref() {},
				terminate() {
					worker.terminated = true;
				}
			};
			created.push({ script, data, worker });
			return worker;
		};
		return { created, createWorker };
	}

	it('drives the spinner worker on a terminal with a file descriptor and lets it write the closing line', () => {
		const s = stream(true, 7);
		const { created, createWorker } = fakeWorker(true);
		const progress = new StartupProgress(s, theme, { now: () => 0, createWorker });
		progress.begin('load', 'files', 4);
		progress.tick();
		progress.end('4 files');
		expect(created).to.have.length(1);
		expect(created[0].script.endsWith('startup-progress-worker.js')).to.equal(true);
		expect(created[0].data.fd).to.equal(7);
		expect(created[0].data.theme).to.equal('pickle');
		expect(created[0].worker.posted).to.deep.equal([
			{ type: 'start', phase: 'load', detail: 'files', total: 4 },
			{ type: 'tick' },
			{ type: 'end', text: '4 files, 0ms' }
		]);
		expect(s.writes.map(strip), 'only the opening line came from the main thread').to.deep.equal([
			'[ | ] Packing the jars — files (0/4)\r\n'
		]);
		progress.finish();
		expect(created[0].worker.terminated).to.equal(true);
	});

	it('writes the closing line itself and drops a worker that does not answer in time', () => {
		const s = stream(true, 7);
		const { created, createWorker } = fakeWorker(false);
		const progress = new StartupProgress(s, theme, { now: () => 0, createWorker, handshakeTimeoutMs: 20 });
		progress.begin('load', 'files', 4);
		progress.end('4 files');
		expect(created[0].worker.terminated).to.equal(true);
		expect(s.writes.at(-1)?.startsWith(REDRAW_PREFIX(1))).to.equal(true);
		expect(strip(s.writes.at(-1)!)).to.equal('[ ✓ ] Packing the jars — files 4 files, 0ms\r\n');
		progress.begin('launch');
		expect(created, 'a new worker for the next phase').to.have.length(2);
		progress.finish();
	});

	it('falls back to the in-thread renderer when no worker can be started', () => {
		const s = stream(true, 7);
		const progress = new StartupProgress(s, theme, { now: () => 0, createWorker: () => undefined });
		progress.begin('resolve', undefined, 1);
		expect(s.writes).to.have.length(2);
		expect(s.writes[1].startsWith(REDRAW_PREFIX(1))).to.equal(true);
		progress.finish();
	});
});

describe('describeTranspiler', () => {
	const esm = '@lynxwall/cucumber-tsflow/lib/transpilers/esm';
	const cjs = '@lynxwall/cucumber-tsflow/lib/transpilers';
	const cases: Array<[string[], string[], string | undefined]> = [
		[[], [`${esm}/esnode-loader`], 'es-node-esm'],
		[[], [`${esm}/esvue-loader`], 'es-vue-esm'],
		[[], [`${esm}/tsnode-loader`], 'ts-node-esm'],
		[[], [`${esm}/vue-loader`], 'ts-vue-esm'],
		[[`${cjs}/esnode`], [], 'es-node'],
		[[`${cjs}/esvue`], [], 'es-vue'],
		[[`${cjs}/tsnode`], [], 'ts-node'],
		[[`${cjs}/tsnode-exp`], [], 'ts-node'],
		[[`${cjs}/tsvue`], [], 'ts-vue'],
		[[`${cjs}/tsvue-exp`], [], 'ts-vue'],
		[['C:\\p\\lib\\transpilers\\esnode'], [], 'es-node'],
		[['ts-node/register'], ['./my-loader.mjs'], undefined],
		[[], [], undefined]
	];
	for (const [requireModules, loaders, expected] of cases) {
		it(`${JSON.stringify([...requireModules, ...loaders])} -> ${expected}`, () => {
			expect(describeTranspiler(requireModules, loaders)).to.equal(expected);
		});
	}
});

describe('themes and words', () => {
	it('resolves the theme from TSFLOW_THEME, case and whitespace insensitively', () => {
		expect(resolveStartupTheme(undefined)?.name).to.equal('pickle');
		expect(resolveStartupTheme('')?.name).to.equal('pickle');
		expect(resolveStartupTheme('anything')?.name).to.equal('pickle');
		expect(resolveStartupTheme(' LOTR ')?.name).to.equal('lotr');
		for (const off of ['off', 'OFF', 'none', 'false', ' Off '])
			expect(resolveStartupTheme(off), off).to.equal(undefined);
	});

	it('pluralizes', () => {
		expect(plural(1, 'support file')).to.equal('1 support file');
		expect(plural(0, 'support file')).to.equal('0 support files');
		expect(plural(12, 'hook')).to.equal('12 hooks');
	});
});
