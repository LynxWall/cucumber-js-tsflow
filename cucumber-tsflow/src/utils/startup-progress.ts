/**
 * Startup progress feedback for the cucumber-tsflow CLI.
 *
 * Between "Running Cucumber-TsFlow in Serial mode." and the first formatter output a large suite can sit
 * silent for a long time while support files are transpiled and loaded. This module prints one line per
 * startup phase — a themed label and a plain-language note on what is actually happening — followed by a
 * spinner and a running count that are redrawn in place while the phase is open, and the elapsed time and
 * a summary when it completes.
 *
 * The spinner is the classic four-frame ASCII line spinner (`|`, `/`, `-`, `\`) inside brackets, advanced
 * every 130 ms, the interval the `cli-spinners` "line" preset uses. It appears the moment the phase line is
 * printed, so there is visible motion before the first unit of work completes. On an interactive terminal it
 * is drawn by a worker thread (`startup-progress-worker.ts`) writing straight to the terminal's file
 * descriptor, so it keeps turning while the main thread is blocked in synchronous transpile-and-load work.
 * On a non-TTY stream (CI logs, a file) nothing is redrawn and the output stays append-only.
 *
 * Themes are selected with `TSFLOW_THEME`:
 *
 * - unset, or any unrecognised value: the default pickling theme
 * - `lotr`: The Lord of the Rings
 * - `off`: no startup progress output at all
 */
import ansis from 'ansis';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

/** The startup phases in the order `runCucumber` executes them. `preload` only runs when `parallelLoad` is on. */
export type StartupPhaseId = 'resolve' | 'preload' | 'load' | 'assemble' | 'launch';

interface PhaseText {
	/** Themed label printed at the start of the phase */
	title: string;
	/**
	 * Printed by the heartbeat while the phase is open but nothing has completed yet (the first support file
	 * pulls in its whole import graph, so the first unit of work can take a long time). Falls back to the theme's.
	 */
	waiting?: string;
	/**
	 * Heartbeat quips for this phase, rotated in order. Placeholders: `{done}` units completed so far, `{left}`
	 * remaining, `{total}` expected, `{elapsed}` time since the phase began. Falls back to the theme's.
	 */
	quips?: string[];
	/** Shown when work resumes after a stall long enough to have produced a quip. Falls back to the theme's. */
	relief?: string[];
}

export interface StartupTheme {
	name: string;
	/** Colour applied to phase titles */
	label: (text: string) => string;
	/** Colour applied to the plain-language detail, the heartbeat quips and the elapsed-time summary */
	detail: (text: string) => string;
	/** Colour applied to the spinner */
	spinner: (text: string) => string;
	/** Text printed between a title and its detail */
	separator: string;
	/** Heartbeat text while a phase has completed no units yet, for phases without their own */
	waiting: string;
	/** Heartbeat quips for phases without their own */
	quips: string[];
	/** Relief messages (work resumed after a long stall) for phases without their own */
	relief: string[];
	phases: Record<StartupPhaseId, PhaseText>;
}

/** Spinner frames, in clockwise order */
const SPINNER_FRAMES = ['|', '/', '-', '\\'];
/** What the spinner slot shows once the phase has completed */
const DONE_MARK = '✓';
/** Time between spinner frames (the `cli-spinners` "line" preset interval) */
export const SPINNER_INTERVAL_MS = 130;
/** How long a phase may go without a message before the heartbeat shows a quip */
const HEARTBEAT_MS = 30_000;
/** A gap between units of work at least this long counts as a stall; the next unit brings a relief message */
const STALL_MS = 30_000;
/** How long a message stays on its line before it clears itself */
const MESSAGE_VISIBLE_MS = 8_000;
/** Terminal width assumed when the stream cannot report one; wide, so an unknown terminal is treated as not wrapping */
export const DEFAULT_COLUMNS = 120;

const steelBlue = ansis.hex('#5F87AF');
const gold = ansis.hex('#D4AF37');

/** Default theme: the steps of making pickles, since cucumbers are what we are working with. */
const PICKLE_THEME: StartupTheme = {
	name: 'pickle',
	label: text => steelBlue(text),
	detail: text => ansis.dim(text),
	spinner: text => steelBlue(text),
	separator: ' — ',
	waiting: 'still at it, {elapsed} so far',
	quips: ['{done} of {total} done, {elapsed} in', 'still going: {done} down, {left} to go'],
	relief: [
		'phew, that was a big jar. Back to the quick ones',
		'that one fought back. All right, we are back on track',
		'okay, that jar needed a bigger lid. Moving on'
	],
	phases: {
		resolve: { title: 'Prepping the cucumbers' },
		preload: {
			title: 'Making the brine',
			waiting: 'waiting for the brine to come to a boil — the worker threads are still starting up',
			quips: [
				'brine is simmering: {done} of {total} files warmed',
				'stirring... {done} of {total}. The brine takes as long as the brine takes',
				'{done} warmed, {left} to go. Nobody rushes a good brine'
			]
		},
		load: {
			title: 'Packing the jars',
			waiting: 'still packing the first jar — the first file pulls in its whole import graph, the rest go much faster',
			quips: [
				'whoa, that is a lot of jars. {done} packed so far, {left} to go',
				'{done} jars packed, {left} to go. My back is starting to hurt',
				'does anybody actually eat this many pickles? {done} of {total} jars',
				'{done} down, {left} left. Grandma never said pickling took this long'
			]
		},
		assemble: {
			title: 'Pouring and sealing',
			quips: ['{done} of {total} jars sealed. Mind the hot brine']
		},
		launch: {
			title: 'Cooling and chilling',
			waiting: 'the jars are cooling — BeforeAll hooks are running, {elapsed} so far',
			quips: ['{done} of {total} jars in the fridge. Each worker has to load the support code for itself']
		}
	}
};

/** Opt-in theme: TSFLOW_THEME=lotr */
const LOTR_THEME: StartupTheme = {
	name: 'lotr',
	label: text => gold(text),
	detail: text => ansis.dim(text),
	spinner: text => gold(text),
	separator: ' — ',
	waiting: 'the road goes ever on, {elapsed} so far',
	quips: ['{done} of {total} behind us, {left} ahead', 'not all those who wander are lost: {done} of {total}'],
	relief: [
		'we are through Moria. Onward, and quickly, before anything else wakes up',
		'"Fly, you fools!" Right, that one is behind us. Back to the road',
		'the Dead Marshes are behind us. Do not follow the lights'
	],
	phases: {
		resolve: { title: 'Assembling the Fellowship' },
		preload: {
			title: 'Lighting the beacons of Gondor',
			waiting: 'the first beacon is not yet lit — the worker threads are still starting up',
			quips: [
				'the beacons are lit! Gondor calls for aid: {done} of {total} files warmed',
				'and Rohan will answer. {done} warmed, {left} to go'
			]
		},
		load: {
			title: 'One does not simply walk into Mordor',
			waiting:
				'the first file drags its whole import graph along like a Fellowship of dependencies; the rest move faster',
			quips: [
				'{done} leagues behind us, {left} to go. Po-ta-toes would help about now',
				'one does not simply load {total} files. {done} down, {left} to go',
				'"I can not carry it for you, but I can carry you!" {done} of {total}',
				'"If I take one more step, it will be the farthest from home I have ever been." {done} of {total}',
				'"Is it secret? Is it safe?" {done} files in, {left} still unaccounted for'
			]
		},
		assemble: {
			title: 'Reading the Red Book of Westmarch',
			quips: ['{done} of {total} chapters read. Bilbo did go on a bit']
		},
		launch: {
			title: 'Mustering the Rohirrim',
			waiting: 'the horn of Helm Hammerhand sounds — BeforeAll hooks are running, {elapsed} so far',
			quips: ['"Ride now! Ride for ruin!" {done} of {total} riders mustered, each loading the support code']
		}
	}
};

/**
 * Resolve the theme selected by `TSFLOW_THEME`. Returns undefined when progress output is turned off.
 */
export function resolveStartupTheme(value: string | undefined = process.env.TSFLOW_THEME): StartupTheme | undefined {
	const normalized = (value ?? '').trim().toLowerCase();
	if (normalized === 'off' || normalized === 'none' || normalized === 'false') {
		return undefined;
	}
	if (normalized === 'lotr') {
		return LOTR_THEME;
	}
	return PICKLE_THEME;
}

/** Minimal writable interface accepted by `StartupProgress` (process.stdout, formatter streams). */
export interface ProgressOutputStream {
	write(chunk: string): unknown;
	/** True for an interactive terminal. The spinner is drawn and redrawn in place only when this is set. */
	isTTY?: boolean;
	/** File descriptor, when the stream is backed by one (`process.stdout.fd` is 1). Lets the spinner thread write directly. */
	fd?: number;
	/** Terminal width in columns, when known (`process.stdout.columns`). Used to count the rows a wrapped line occupies. */
	columns?: number;
}

/**
 * Cursor to column 0 (`CSI 1 G`, cursor horizontal absolute). Deliberately not `\r`: libuv's Windows TTY
 * writer remembers the last line-ending character it saw on a handle and swallows a `\r` that directly
 * follows a `\n`, on the assumption that the two were a reordered `\r\n`. Every closing line here ends with
 * a newline and the next redraw on the same handle begins by going to column 0, so with `\r` that redraw
 * would erase the row but keep the cursor wherever the main thread's opening text ended, and the line
 * would wrap from there. The CSI sequence is passed through untouched.
 */
const COLUMN_0 = '\x1b[1G';
/** Erase from the cursor to the end of the screen */
const ERASE_DOWN = '\x1b[0J';
/** Line ending; explicit CR plus LF behaves identically whether or not the terminal auto-returns on LF */
const NEW_LINE = '\r\n';

/** Move the cursor up `n` rows; nothing at all for 0 (terminals treat `CSI 0 A` as `CSI 1 A`). */
function cursorUp(n: number): string {
	return n > 0 ? `\x1b[${n}A` : '';
}

interface OpenPhase {
	id: StartupPhaseId;
	/** Plain detail text, printed whole; a long detail wraps */
	detail: string | undefined;
	start: number;
	/** Units of work completed so far */
	ticks: number;
	/** Units of work expected, when known */
	total: number | undefined;
	frame: number;
	lastFrame: number;
	lastTick: number;
	/** When the last message (quip or relief) was shown; heartbeat quips are measured from here */
	lastMessage: number;
	/** Heartbeat quips shown so far (index into the rotation) */
	beats: number;
	/** Relief messages shown so far (index into the rotation) */
	reliefs: number;
	/** Whether the message line beneath the phase line has been created on screen */
	messageLineOpen: boolean;
	/** The message currently showing on the message line, if any */
	message: string | undefined;
	/** When the message currently on screen should clear itself, if one is showing */
	messageClearAt: number | undefined;
}

/**
 * Renders a phase: the spinner in a fixed slot at the start of the line, the title and detail, the
 * `done/total` counter at the end, and a message line directly beneath for heartbeat quips and relief
 * messages, which replace one another in place and clear themselves. Synchronous and without timers of its
 * own, so it can run on the main thread or inside the spinner worker thread.
 *
 * Nothing is fitted to the terminal width: every line is printed whole and wraps wherever the terminal
 * wraps it. In `tty` mode the block (phase line plus message line) is redrawn whole on every frame from its
 * top-left corner, where the cursor rests between writes: erase to the end of the screen, write the block,
 * move back up as many rows as the block occupies at the current width. That row count is the only use
 * of the width, and it is read on every redraw so a window resized mid-phase is redrawn correctly.
 * In `plain` mode nothing is redrawn: the caller has already written the phase line, and messages and the
 * closing text are appended.
 */
export class PhaseRenderer {
	private current: OpenPhase | undefined;

	/**
	 * @param write - Sink for output. Every call is a complete chunk; the renderer never assumes buffering.
	 * @param theme - Active theme
	 * @param mode - `tty` redraws in place; `plain` appends
	 * @param columns - Current terminal width, consulted on every redraw; only used in `tty` mode
	 */
	constructor(
		private readonly write: (text: string) => void,
		private readonly theme: StartupTheme,
		private readonly mode: 'tty' | 'plain',
		private readonly columns: () => number = () => DEFAULT_COLUMNS
	) {}

	/**
	 * The first frame of a phase line, for the caller to print before the renderer takes over so the spinner
	 * is on screen from the first write. Identical to what the first redraw produces.
	 */
	static openingLine(
		theme: StartupTheme,
		id: StartupPhaseId,
		detail: string | undefined,
		total: number | undefined,
		tty: boolean
	): string {
		if (!tty) return phaseText(theme, id, detail);
		return `${theme.spinner(`[ ${SPINNER_FRAMES[0]} ]`)} ${phaseText(theme, id, detail)}${theme.detail(counterText(0, total))}`;
	}

	/** The finished form of a phase line: check mark, title and detail, closing text. */
	static closingLine(theme: StartupTheme, id: StartupPhaseId, detail: string | undefined, text: string): string {
		return `${theme.spinner(`[ ${DONE_MARK} ]`)} ${phaseText(theme, id, detail)}${theme.detail(` ${text}`)}`;
	}

	/**
	 * Rows a piece of text occupies when printed from column 0 at `columns` wide. Escape sequences take no
	 * cells; everything drawn here is single-cell text.
	 */
	static rows(text: string, columns: number): number {
		return Math.max(1, Math.ceil(visibleWidth(text) / Math.max(1, columns)));
	}

	/**
	 * Begin rendering a phase whose opening line has already been written. In `tty` mode the cursor must be
	 * at the top-left of that line (its first row, column 0).
	 */
	start(id: StartupPhaseId, detail: string | undefined, total: number | undefined): void {
		const now = performance.now();
		this.current = {
			id,
			detail,
			start: now,
			ticks: 0,
			total,
			frame: 0,
			lastFrame: now,
			lastTick: now,
			lastMessage: now,
			beats: 0,
			reliefs: 0,
			messageLineOpen: false,
			message: undefined,
			messageClearAt: undefined
		};
		this.redraw();
	}

	/**
	 * Record one completed unit of work. The counter is redrawn, and if the unit ended a stall long enough
	 * to have shown a quip, a relief message replaces it.
	 */
	tick(): void {
		if (!this.current) return;
		const now = performance.now();
		this.current.ticks++;
		if (now - this.current.lastTick >= STALL_MS) {
			const phase = this.theme.phases[this.current.id];
			const relief = phase.relief ?? this.theme.relief;
			this.showMessage(this.fill(relief[this.current.reliefs % relief.length], now), now);
			this.current.reliefs++;
		}
		this.current.lastTick = now;
		this.redraw();
	}

	/**
	 * Advance time-driven output: show a heartbeat quip when the phase has gone long enough without a
	 * message, clear a message that has been up long enough, and advance the spinner frame. Called from a timer.
	 */
	pump(): void {
		if (!this.current) return;
		const now = performance.now();
		if (now - this.current.lastMessage >= HEARTBEAT_MS) {
			this.beat(now);
		} else if (this.current.messageClearAt !== undefined && now >= this.current.messageClearAt) {
			this.clearMessage();
		}
		if (now - this.current.lastFrame >= SPINNER_INTERVAL_MS) {
			this.current.frame = (this.current.frame + 1) % SPINNER_FRAMES.length;
			this.current.lastFrame = now;
			this.redraw();
		}
	}

	/**
	 * Finish the phase: the spinner slot becomes a check mark, the closing text (summary and elapsed time)
	 * replaces the counter, the message line is erased, and the cursor is left at the start of a fresh line.
	 */
	end(text: string): void {
		if (!this.current) return;
		if (this.mode === 'tty') {
			const { id, detail } = this.current;
			this.write(`${ERASE_DOWN}${PhaseRenderer.closingLine(this.theme, id, detail, text)}${NEW_LINE}`);
		} else {
			this.write(`${this.theme.detail(` ${text}`)}\n`);
		}
		this.current = undefined;
	}

	/** Heartbeat: show the next quip (or the waiting text while nothing has completed). */
	private beat(now: number): void {
		if (!this.current) return;
		const phase = this.theme.phases[this.current.id];
		let template: string;
		if (this.current.ticks === 0) {
			template = phase.waiting ?? this.theme.waiting;
		} else {
			const quips = phase.quips ?? this.theme.quips;
			template = quips[this.current.beats % quips.length];
			this.current.beats++;
		}
		this.showMessage(this.fill(template, now), now);
	}

	/** Substitute the `{done}` / `{total}` / `{left}` / `{elapsed}` placeholders. */
	private fill(template: string, now: number): string {
		if (!this.current) return template;
		const { ticks, total, start } = this.current;
		return template
			.replace(/\{done\}/g, String(ticks))
			.replace(/\{total\}/g, total === undefined ? '?' : String(total))
			.replace(/\{left\}/g, total === undefined ? '?' : String(Math.max(0, total - ticks)))
			.replace(/\{elapsed\}/g, formatDuration(now - start));
	}

	/** Put a message on the line beneath the phase line (or append it, in plain mode). */
	private showMessage(text: string, now: number): void {
		if (!this.current) return;
		this.current.lastMessage = now;
		if (this.mode === 'plain') {
			this.write(this.theme.detail(` ${text}`));
			return;
		}
		this.current.message = text;
		this.current.messageLineOpen = true;
		this.current.messageClearAt = now + MESSAGE_VISIBLE_MS;
		this.redraw();
	}

	/** Blank the message line, leaving it in place so the layout does not shift. */
	private clearMessage(): void {
		if (!this.current) return;
		this.current.messageClearAt = undefined;
		this.current.message = undefined;
		if (this.mode === 'tty') this.redraw();
	}

	/**
	 * Rewrite the whole block from its top-left corner: erase to the end of the screen, the phase line
	 * (spinner slot, title and detail, counter), the message line when it has been opened, then back up to
	 * the top-left so the next redraw starts from the same place. Writing forward and counting rows at the
	 * current width is what lets a wrapped line be redrawn.
	 */
	private redraw(): void {
		if (!this.current || this.mode !== 'tty') return;
		const { id, detail, frame, ticks, total, messageLineOpen, message } = this.current;
		const columns = this.columns();
		const slot = this.theme.spinner(`[ ${SPINNER_FRAMES[frame]} ]`);
		const line = `${slot} ${phaseText(this.theme, id, detail)}${this.theme.detail(counterText(ticks, total))}`;
		let text = `${ERASE_DOWN}${line}`;
		let below = PhaseRenderer.rows(line, columns) - 1;
		if (messageLineOpen) {
			const messageText = message ? this.theme.detail(message) : '';
			text += `${NEW_LINE}${messageText}`;
			below += PhaseRenderer.rows(messageText, columns);
		}
		this.write(`${text}${cursorUp(below)}${COLUMN_0}`);
	}
}

/** The coloured title, and the detail after the separator when there is one. */
function phaseText(theme: StartupTheme, id: StartupPhaseId, detail: string | undefined): string {
	const title = theme.label(theme.phases[id].title);
	return detail ? title + theme.detail(theme.separator + detail) : title;
}

/** The counter at the end of the phase line: ` done/total`, ` done` when the total is unknown, nothing before the first tick. */
function counterText(ticks: number, total: number | undefined): string {
	if (total !== undefined) return ` ${ticks}/${total}`;
	return ticks > 0 ? ` ${ticks}` : '';
}

// eslint-disable-next-line no-control-regex
const ESCAPE_SEQUENCE = /\x1b\[[\d;?]*[ -/]*[@-~]/g;

/** Number of terminal cells `text` occupies: code points outside escape sequences (everything drawn here is single-cell). */
function visibleWidth(text: string): number {
	return [...text.replace(ESCAPE_SEQUENCE, '')].length;
}

/** Messages from `StartupProgress` to the spinner worker thread. */
export type SpinnerWorkerCommand =
	| { type: 'start'; phase: StartupPhaseId; detail: string | undefined; total: number | undefined }
	| { type: 'tick' }
	| { type: 'end'; text: string };

/** `workerData` handed to the spinner worker thread. */
export interface SpinnerWorkerData {
	/** File descriptor to write to (the terminal) */
	fd: number;
	/** Theme name, resolved again inside the worker (colour functions cannot cross the thread boundary) */
	theme: string;
	/** One `Int32`; the worker sets it to 1 and notifies after it has finished writing an `end` */
	signal: SharedArrayBuffer;
}

/** How long `end()` waits for the worker to write the closing line before giving up. */
const END_HANDSHAKE_TIMEOUT_MS = 2000;

/**
 * Prints themed startup progress. One instance per `runCucumber` call, in the main process only.
 *
 * On an interactive terminal the spinner, counter and message line are drawn by a `worker_threads` worker
 * that writes directly to the terminal's file descriptor. The main thread spends most of a phase blocked in
 * synchronous work (an `import()` whose graph runs through in-thread ESM hooks and the Vue compiler, or a run
 * of `require()` calls), during which its own timers cannot fire; the worker has its own event loop and
 * keeps the spinner moving regardless. The main thread writes only the opening phase line and, when the
 * phase ends, waits for the worker to write the closing line before continuing, so the two never write out
 * of order.
 *
 * On a non-TTY stream nothing is redrawn: the phase line, any messages and the closing text are appended
 * in order on the main thread, best effort while the event loop is free.
 *
 * Every method is a no-op when the theme is turned off, so callers can wire progress unconditionally.
 */
export class StartupProgress {
	private current: { id: StartupPhaseId; detail: string | undefined; start: number } | undefined;
	/** In-thread renderer and its timer, used when there is no spinner worker */
	private local: { renderer: PhaseRenderer; timer: ReturnType<typeof setInterval> } | undefined;
	private worker: Worker | undefined;
	private readonly signal = new Int32Array(new SharedArrayBuffer(4));

	/**
	 * @param stream - Where progress is written (the run environment's stdout)
	 * @param theme - Theme from `resolveStartupTheme()`; undefined turns every method into a no-op
	 */
	constructor(
		private readonly stream: ProgressOutputStream,
		private readonly theme: StartupTheme | undefined
	) {}

	/** Whether anything will be printed. */
	get enabled(): boolean {
		return this.theme !== undefined;
	}

	/**
	 * Start a phase: prints its themed title and a plain-language note on what is happening with the spinner
	 * already in place, then hands the line to the renderer. Ends the previous phase first if it is still open.
	 * The line is printed whole and wraps on a narrow terminal; on a TTY the cursor is then parked at the
	 * line's top-left, which is where the renderer expects it.
	 *
	 * @param total - Expected number of units of work, shown in the counter and the heartbeat quips
	 */
	begin(id: StartupPhaseId, detail?: string, total?: number): void {
		if (!this.theme) return;
		if (this.current) this.end();
		const tty = Boolean(this.stream.isTTY);
		const opening = PhaseRenderer.openingLine(this.theme, id, detail, total, tty);
		const park = tty ? cursorUp(PhaseRenderer.rows(opening, this.width()) - 1) + COLUMN_0 : '';
		this.stream.write(opening + park);
		this.current = { id, detail, start: performance.now() };

		const worker = this.spinnerWorker();
		if (worker) {
			worker.postMessage({ type: 'start', phase: id, detail, total } satisfies SpinnerWorkerCommand);
			return;
		}
		const renderer = new PhaseRenderer(
			chunk => this.stream.write(chunk),
			this.theme,
			tty ? 'tty' : 'plain',
			() => this.width()
		);
		const timer = setInterval(() => renderer.pump(), SPINNER_INTERVAL_MS);
		timer.unref();
		this.local = { renderer, timer };
		renderer.start(id, detail, total);
	}

	/** Record one completed unit of work. */
	tick(): void {
		if (!this.theme || !this.current) return;
		if (this.worker) {
			this.worker.postMessage({ type: 'tick' } satisfies SpinnerWorkerCommand);
		} else {
			this.local?.renderer.tick();
		}
	}

	/** Finish the current phase: replaces the spinner with a check mark and the counter with the elapsed time (and an optional summary). */
	end(summary?: string): void {
		if (!this.theme || !this.current) return;
		const { id, detail, start } = this.current;
		const elapsed = formatDuration(performance.now() - start);
		const text = summary ? `${summary}, ${elapsed}` : elapsed;
		this.current = undefined;

		if (this.local) {
			clearInterval(this.local.timer);
			this.local.renderer.end(text);
			this.local = undefined;
			return;
		}
		if (this.worker) {
			// Wait for the worker to write the closing line, so whatever the caller prints next (the next
			// phase line, a formatter's first output) lands after it.
			Atomics.store(this.signal, 0, 0);
			this.worker.postMessage({ type: 'end', text } satisfies SpinnerWorkerCommand);
			const outcome = Atomics.wait(this.signal, 0, 0, END_HANDSHAKE_TIMEOUT_MS);
			if (outcome === 'timed-out') {
				// The cursor rests at the top-left of the block, so write the closing line the worker did not.
				this.disposeWorker();
				this.stream.write(`${ERASE_DOWN}${PhaseRenderer.closingLine(this.theme, id, detail, text)}${NEW_LINE}`);
			}
		}
	}

	/**
	 * Finish the open phase (if any), print a blank line so the formatter output starts on its own line, and
	 * stop the spinner worker. Safe to call more than once.
	 */
	finish(): void {
		if (!this.theme) return;
		if (this.current) {
			this.end();
			this.stream.write('\n');
		}
		this.disposeWorker();
	}

	/** Current terminal width, or the default when the stream does not report one. */
	private width(): number {
		return this.stream.columns || DEFAULT_COLUMNS;
	}

	/**
	 * The spinner worker for this stream, started on first use. Undefined when the stream is not a terminal
	 * backed by a file descriptor, or the compiled worker script is not present (the in-thread renderer is
	 * used instead).
	 */
	private spinnerWorker(): Worker | undefined {
		if (this.worker) return this.worker;
		if (!this.theme || !this.stream.isTTY || typeof this.stream.fd !== 'number') return undefined;
		const script = path.join(__dirname, 'startup-progress-worker.js');
		if (!existsSync(script)) return undefined;
		const data: SpinnerWorkerData = {
			fd: this.stream.fd,
			theme: this.theme.name,
			signal: this.signal.buffer as SharedArrayBuffer
		};
		this.worker = new Worker(script, {
			workerData: data,
			// A worker thread has no TTY of its own, so tell its ansis instance the colour depth this thread detected.
			env: { ...process.env, FORCE_COLOR: String(detectColorLevel()) },
			stdout: false,
			stderr: false
		});
		this.worker.unref();
		this.worker.on('error', () => this.disposeWorker());
		return this.worker;
	}

	private disposeWorker(): void {
		if (!this.worker) return;
		void this.worker.terminate();
		this.worker = undefined;
	}
}

/**
 * The colour depth ansis chose for this thread, as a `FORCE_COLOR` level: 3 truecolor, 2 for 256 colours,
 * 1 for the basic 16, 0 for none.
 */
function detectColorLevel(): number {
	const sample = ansis.hex('#010203')('x');
	if (sample.includes('38;2;')) return 3;
	if (sample.includes('38;5;')) return 2;
	if (sample.includes('\x1b[')) return 1;
	return 0;
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60000);
	const seconds = Math.round((ms % 60000) / 1000);
	return `${minutes}m ${seconds}s`;
}

const TRANSPILER_NAMES: Array<[RegExp, string]> = [
	[/transpilers\/esm\/esnode-loader/, 'es-node-esm'],
	[/transpilers\/esm\/esvue-loader/, 'es-vue-esm'],
	[/transpilers\/esm\/tsnode-loader/, 'ts-node-esm'],
	[/transpilers\/esm\/vue-loader/, 'ts-vue-esm'],
	[/transpilers\/esnode$/, 'es-node'],
	[/transpilers\/esvue$/, 'es-vue'],
	[/transpilers\/tsnode(-exp)?$/, 'ts-node'],
	[/transpilers\/tsvue(-exp)?$/, 'ts-vue']
];

/**
 * Name the configured `transpiler` from the require modules and loaders it expands to, for the progress
 * detail text. Returns undefined when none of the built-in transpilers is in use.
 */
export function describeTranspiler(requireModules: readonly string[], loaders: readonly string[]): string | undefined {
	for (const specifier of [...loaders, ...requireModules]) {
		const normalized = specifier.replace(/\\/g, '/');
		for (const [pattern, name] of TRANSPILER_NAMES) {
			if (pattern.test(normalized)) return name;
		}
	}
	return undefined;
}

/** "1 support file" / "312 support files" */
export function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
