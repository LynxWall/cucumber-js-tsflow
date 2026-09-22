/**
 * `--watch`: run, then stay resident and run again whenever a feature file, a support file or a module the
 * support code loaded changes, or when the user presses Enter. `q` (or Ctrl-C) quits.
 *
 * The point of staying resident is the support code: on a rerun `runCucumber` is given a `SupportReloader`
 * (see `api/support-reloader.ts`) that keeps every module loaded except those that have to evaluate again,
 * so the second and later runs skip the framework, jsdom, Vue and helper loading a fresh process pays every
 * time. When the configuration's loader runs on Node's loader hooks thread that is not possible, and each
 * run is instead a fresh `cucumber-tsflow` child process with the same arguments (plus `--no-watch`).
 *
 * What is watched: the directories that contain the known files (features, support files and, in the
 * resident case, every project module loaded so far), with one non-recursive `fs.watch` each, refreshed
 * after every run. A change to a known file, or the appearance of a new file with a feature or code
 * extension in one of those directories, triggers a rerun after a short quiet period. A file in a directory
 * no known file lived in is picked up by the next rerun (press Enter), which globs the paths again.
 */
import { FSWatcher, watch as watchDirectory } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import ansis from 'ansis';
import { IRunEnvironment, makeEnvironment } from '@cucumber/cucumber/lib/environment/index';
import { resolvePaths } from '@cucumber/cucumber/lib/paths/index';
import type { ISupportCodeCoordinates } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import { runCucumber } from '../api/run-cucumber';
import { SupportReloader } from '../api/support-reloader';
import { ITsFlowRunConfiguration } from '../runtime/types';
import { resetTranspileCacheStats } from '../transpilers/transpile-cache';
import { formatDuration } from '../utils/helpers';
import { canonicalPath } from '../utils/module-graph';
import { plural } from '../utils/startup-progress';
import { createLogger } from '../utils/tsflow-logger';
import { resetTimings } from '../utils/tsflow-timing';

const logger = createLogger('watch');

/** Quiet period after the last file event before a rerun starts; editors often write a file more than once. */
const DEBOUNCE_MS = 200;

/** A new file with one of these extensions in a watched directory counts as a change. */
const WATCHED_EXTENSIONS = new Set(['.feature', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue']);

/** Placeholder in the changed set for an event whose file the platform did not name. */
const UNKNOWN_CHANGE = '*';

/**
 * The heap in use, after a full collection when Node was started with `--expose-gc` (so the figure is what the
 * next run really starts from, not garbage the collector has not got to yet); otherwise as it stands.
 */
function heapUsedAfterCollection(): number {
	(globalThis as { gc?: () => void }).gc?.();
	return process.memoryUsage().heapUsed;
}

/** `512 MB`, `3.4 GB`. */
function formatBytes(bytes: number): string {
	const mb = bytes / (1024 * 1024);
	return mb < 1000 ? `${Math.round(mb)} MB` : `${(mb / 1024).toFixed(1)} GB`;
}

export interface IWatchOptions {
	/** The CLI's own argv, rerun in a child process when the support code cannot be reloaded in place */
	argv: readonly string[];
	/** Where key presses are read from; `process.stdin` by default */
	stdin?: KeyInput;
}

/** The part of `process.stdin` (a TTY, a pipe or a file) the session uses. */
export interface KeyInput {
	isTTY?: boolean;
	setRawMode?(mode: boolean): unknown;
	setEncoding(encoding: Parameters<Readable['setEncoding']>[0]): unknown;
	on(event: 'data', listener: (chunk: string | Buffer) => void): unknown;
	off(event: 'data', listener: (chunk: string | Buffer) => void): unknown;
	resume(): unknown;
	pause(): unknown;
	unref?(): unknown;
}

interface WatchOutput {
	write(chunk: string): unknown;
}

/**
 * Run the configuration, then keep running it on changes until the user quits. Resolves to the success of
 * the last run.
 */
export async function watchCucumber(
	runConfiguration: ITsFlowRunConfiguration,
	environment: IRunEnvironment,
	options: IWatchOptions
): Promise<boolean> {
	const session = new WatchSession(runConfiguration, environment, options);
	return session.run();
}

class WatchSession {
	private readonly cwd: string;
	private readonly stdout: WatchOutput;
	private readonly stderr: WatchOutput;
	private readonly stdin: KeyInput;
	private readonly coordinates: ISupportCodeCoordinates;
	private readonly reloader: SupportReloader | undefined;
	private readonly unsupportedReason: string | undefined;
	private readonly watchers = new Map<string, FSWatcher>();
	private known = new Set<string>();
	private changed = new Set<string>();
	private debounce: ReturnType<typeof setTimeout> | undefined;
	private running = false;
	private rerunRequested = false;
	private quitting = false;
	private lastSuccess = false;
	private resolveQuit: (() => void) | undefined;

	constructor(
		private readonly runConfiguration: ITsFlowRunConfiguration,
		private readonly environment: IRunEnvironment,
		private readonly options: IWatchOptions
	) {
		const merged = makeEnvironment(environment);
		this.cwd = merged.cwd;
		this.stdout = merged.stdout as unknown as WatchOutput;
		this.stderr = merged.stderr as unknown as WatchOutput;
		this.stdin = options.stdin ?? process.stdin;
		this.coordinates = {
			requireModules: [],
			requirePaths: [],
			loaders: [],
			importPaths: [],
			...runConfiguration.support
		};
		this.unsupportedReason = SupportReloader.unsupportedReason(this.coordinates);
		this.reloader = this.unsupportedReason ? undefined : new SupportReloader();
	}

	async run(): Promise<boolean> {
		this.stdout.write(
			ansis.cyanBright('Watch mode: ') +
				'the run repeats whenever a feature or support file changes. ' +
				ansis.dim('Enter reruns, q quits.') +
				'\n'
		);
		if (this.unsupportedReason) {
			this.stdout.write(
				ansis.dim(
					`Support code cannot be kept loaded between runs (${this.unsupportedReason}); each run starts a fresh process.`
				) + '\n'
			);
		}
		this.stdout.write('\n');
		this.listenToKeys();

		const finished = new Promise<void>(resolve => (this.resolveQuit = resolve));
		await this.runOnce([]);
		await finished;
		return this.lastSuccess;
	}

	/** Enter, or a file event: run again once the current run (if any) is over. */
	private requestRerun(): void {
		if (this.quitting) return;
		if (this.running) {
			this.rerunRequested = true;
			return;
		}
		if (this.debounce) clearTimeout(this.debounce);
		this.debounce = setTimeout(() => {
			this.debounce = undefined;
			if (this.running || this.quitting) {
				this.rerunRequested = !this.quitting;
				return;
			}
			const changed = Array.from(this.changed);
			this.changed = new Set();
			void this.runOnce(changed);
		}, DEBOUNCE_MS);
	}

	private async runOnce(changed: string[]): Promise<void> {
		this.running = true;
		this.rerunRequested = false;
		if (changed.length > 0) {
			const names = changed.filter(file => file !== UNKNOWN_CHANGE).map(file => path.relative(this.cwd, file));
			this.stdout.write(
				`${ansis.cyanBright('Changed:')} ${names.length > 0 ? names.join(', ') : 'files in a watched directory'}\n\n`
			);
		}
		const start = performance.now();
		try {
			this.lastSuccess = this.reloader ? await this.runInProcess(changed) : await this.runInChild();
		} catch (error) {
			this.lastSuccess = false;
			this.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
		}
		const elapsed = formatDuration(performance.now() - start);
		this.running = false;

		if (this.quitting) {
			this.finishQuit();
			return;
		}
		await this.refreshWatchers();
		const directories = `${this.watchers.size} ${this.watchers.size === 1 ? 'directory' : 'directories'}`;
		// The heap after a run is what the next run starts from: module state the process keeps on purpose,
		// plus anything the suite left behind (a DOM it mounted into and never cleaned up, say)
		const heap = this.reloader ? `, heap ${formatBytes(heapUsedAfterCollection())}` : '';
		this.stdout.write(
			'\n' +
				ansis.dim(
					`Run took ${elapsed}${heap}. Watching ${plural(this.known.size, 'file')} in ${directories} for changes. Enter reruns, q quits.`
				) +
				'\n'
		);
		if (this.rerunRequested || this.changed.size > 0) this.requestRerun();
	}

	/** The resident case: the same process, with the reloader deciding what evaluates again. */
	private async runInProcess(changed: string[]): Promise<boolean> {
		resetTimings();
		resetTranspileCacheStats();
		// `runCucumber` replaces `support` with the loaded library on the object it is given
		const options = { ...this.runConfiguration };
		const changedPaths = changed.includes(UNKNOWN_CHANGE) && this.reloader ? this.reloader.watchedFiles() : changed;
		const { success } = await runCucumber(options, this.environment, undefined, {
			reloader: this.reloader,
			changedPaths
		});
		return success;
	}

	/** The fallback: a fresh `cucumber-tsflow` with the same arguments, minus watch mode. */
	private runInChild(): Promise<boolean> {
		const [, script, ...rest] = this.options.argv;
		const args = [script, ...rest.filter(arg => arg !== '--watch' && arg !== '-w'), '--no-watch'];
		logger.checkpoint('Starting a child run', { args });
		return new Promise<boolean>(resolve => {
			const child = spawn(process.execPath, args, {
				cwd: this.cwd,
				env: this.environment.env ?? process.env,
				stdio: 'inherit'
			});
			child.on('error', error => {
				this.stderr.write(`${error.message}\n`);
				resolve(false);
			});
			child.on('exit', code => resolve(code === 0));
		});
	}

	/** Watch the directory of every known file, non-recursively; drop watchers on directories no longer needed. */
	private async refreshWatchers(): Promise<void> {
		let files: string[];
		if (this.reloader) {
			files = this.reloader.watchedFiles();
		} else {
			// Nothing in this process loaded the support code, so only the features and support files are known
			const { logger: cucumberLogger } = makeEnvironment(this.environment);
			const { sourcePaths, requirePaths, importPaths } = await resolvePaths(
				cucumberLogger,
				this.cwd,
				this.runConfiguration.sources,
				this.coordinates
			);
			files = [...sourcePaths, ...requirePaths, ...importPaths].map(canonicalPath);
		}
		this.known = new Set(files);

		const directories = new Set(files.map(file => path.dirname(file)));
		for (const directory of directories) {
			if (this.watchers.has(directory)) continue;
			try {
				const watcher = watchDirectory(directory, { persistent: true }, (_event, filename) =>
					this.onFileEvent(directory, filename)
				);
				watcher.on('error', () => {
					watcher.close();
					this.watchers.delete(directory);
				});
				this.watchers.set(directory, watcher);
			} catch (error) {
				logger.checkpoint('Could not watch a directory', { directory, error: String(error) });
			}
		}
		for (const [directory, watcher] of this.watchers) {
			if (!directories.has(directory)) {
				watcher.close();
				this.watchers.delete(directory);
			}
		}
	}

	private onFileEvent(directory: string, filename: string | Buffer | null): void {
		if (this.quitting) return;
		if (!filename) {
			this.changed.add(UNKNOWN_CHANGE);
			this.requestRerun();
			return;
		}
		const file = canonicalPath(path.join(directory, filename.toString()));
		if (!this.known.has(file) && !WATCHED_EXTENSIONS.has(path.extname(file).toLowerCase())) return;
		this.changed.add(file);
		this.requestRerun();
	}

	private listenToKeys(): void {
		const stdin = this.stdin;
		if (stdin.isTTY) stdin.setRawMode?.(true);
		stdin.setEncoding('utf8');
		stdin.on('data', this.onKeys);
		stdin.resume();
	}

	private readonly onKeys = (chunk: string | Buffer): void => {
		for (const key of chunk.toString()) {
			if (key === 'q' || key === '') {
				this.quit();
				return;
			}
			if (key === '\r' || key === '\n') this.requestRerun();
		}
	};

	private quit(): void {
		if (this.quitting) return;
		this.quitting = true;
		if (this.debounce) clearTimeout(this.debounce);
		if (!this.running) this.finishQuit();
	}

	private finishQuit(): void {
		for (const watcher of this.watchers.values()) watcher.close();
		this.watchers.clear();
		const stdin = this.stdin;
		stdin.off('data', this.onKeys);
		if (stdin.isTTY) stdin.setRawMode?.(false);
		stdin.pause();
		// A TTY or pipe stdin is a socket that would otherwise keep the event loop alive
		stdin.unref?.();
		this.stdout.write(ansis.dim('Watch mode stopped.') + '\n');
		this.resolveQuit?.();
	}
}
