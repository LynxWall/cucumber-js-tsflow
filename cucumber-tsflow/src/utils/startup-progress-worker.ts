/**
 * startup-progress-worker.ts
 *
 * Runs inside a `worker_threads` Worker started by `StartupProgress`. Draws the startup spinner, counter and
 * messages for the current phase to the terminal on this thread's own event loop, so the spinner keeps
 * moving while the main thread is blocked in synchronous transpile-and-load work.
 *
 * Output goes through a `tty.WriteStream` opened on the terminal's file descriptor, the same path
 * `process.stdout` takes on the main thread. That is not cosmetic: on Windows a raw `fs.writeSync` hands
 * UTF-8 bytes to the console, which displays them under its OEM code page, so `—` shows as `ΓÇö`, every
 * such character takes three cells instead of one, the line occupies more rows than the renderer counted,
 * and each redraw lands on the wrong row. The TTY stream converts to UTF-16 and uses the console's
 * wide-character write, and it is blocking, so writes complete in order. `fs.writeSync` remains as a
 * fallback only if the TTY handle cannot be opened.
 *
 * The same TTY stream reports the console width. The renderer asks for it on every redraw, and the stream
 * re-queries the console each time (`_refreshSize()`), so the row count it moves the cursor by follows a
 * window that is resized mid-phase; a worker gets no resize events of its own.
 *
 * Protocol (see `SpinnerWorkerCommand`): `start` begins a phase whose opening line the main thread has already
 * written; `tick` records a completed unit of work; `end` writes the closing line, then sets the shared
 * signal to 1 and notifies, which releases the main thread's `Atomics.wait`.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { writeSync } from 'node:fs';
import { WriteStream } from 'node:tty';
import {
	DEFAULT_COLUMNS,
	PhaseRenderer,
	resolveStartupTheme,
	SPINNER_INTERVAL_MS,
	SpinnerWorkerCommand,
	SpinnerWorkerData
} from './startup-progress';

const { fd, theme: themeName, signal } = workerData as SpinnerWorkerData;
const flag = new Int32Array(signal);
const theme = resolveStartupTheme(themeName);

interface Terminal {
	/** Synchronous write */
	write: (text: string) => void;
	/** Current width in columns, re-read from the console */
	columns: () => number;
}

/** Node's `tty.WriteStream` re-queries the console size through this internal method; it emits `error` rather than throwing. */
interface RefreshableWriteStream extends WriteStream {
	_refreshSize?: () => void;
}

/** The terminal: a TTY stream on `fd`, or raw `fs.writeSync` and the default width if that cannot be opened. */
function openTerminal(descriptor: number): Terminal {
	try {
		const stream = new WriteStream(descriptor) as RefreshableWriteStream;
		const ignore = (): void => {};
		return {
			write: text => {
				stream.write(text);
			},
			columns: () => {
				if (stream._refreshSize) {
					stream.on('error', ignore);
					try {
						stream._refreshSize();
					} finally {
						stream.off('error', ignore);
					}
				}
				return stream.columns || DEFAULT_COLUMNS;
			}
		};
	} catch {
		return {
			write: text => {
				writeSync(descriptor, text);
			},
			columns: () => DEFAULT_COLUMNS
		};
	}
}

if (theme && parentPort) {
	const terminal = openTerminal(fd);
	const renderer = new PhaseRenderer(terminal.write, theme, 'tty', terminal.columns);
	let timer: ReturnType<typeof setInterval> | undefined;

	parentPort.on('message', (command: SpinnerWorkerCommand) => {
		switch (command.type) {
			case 'start':
				if (timer) clearInterval(timer);
				renderer.start(command.phase, command.detail, command.total);
				timer = setInterval(() => renderer.pump(), SPINNER_INTERVAL_MS);
				break;
			case 'tick':
				renderer.tick();
				break;
			case 'end':
				if (timer) clearInterval(timer);
				timer = undefined;
				renderer.end(command.text);
				Atomics.store(flag, 0, 1);
				Atomics.notify(flag, 0);
				break;
		}
	});
}
