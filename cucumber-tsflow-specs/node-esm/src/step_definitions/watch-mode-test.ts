import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { after, binding, given, then, when } from '@lynxwall/cucumber-tsflow';
import { expect } from 'chai';

const require = createRequire(import.meta.url);

/** The first run of a fresh process on a busy machine can take a while; the reruns are quick. */
const RUN_TIMEOUT_MS = 120000;

/** Printed by the watch loop once after every completed run. */
const RUN_FINISHED = /Run took /g;

/** The load-phase note on every in-process rerun; the last group is present only when project modules were re-evaluated too. */
const RERUN_NOTE = /\(rerun (\d+): (\d+) evaluated again, (\d+) kept loaded(?:, (\d+) other modules?)?\)/g;

/** Printed by the watch loop when the support code cannot stay loaded and every run is a fresh process. */
const FALLBACK_BANNER = 'Support code cannot be kept loaded between runs';

/** Forward slashes, so that a path the CLI printed reads the same on Windows and Linux. */
function slashes(text: string): string {
	return text.replace(/\\/g, '/');
}

/**
 * One `cucumber-tsflow --watch` child process and everything it has printed.
 */
class WatchSession {
	public child: ChildProcess | undefined;
	public output = '';
	public runs = 0;
	public exitCode: number | null | undefined;
	private readonly waiters: Array<{ runs: number; resolve: () => void }> = [];
	private exited: Promise<number | null> | undefined;
	/** Files this session edited, with their content and timestamps from before the first edit. */
	private readonly originals = new Map<string, { content: Buffer; atime: Date; mtime: Date }>();

	start(profile: string): void {
		const packageRoot = path.dirname(require.resolve('@lynxwall/cucumber-tsflow/package.json'));
		const bin = path.join(packageRoot, 'bin', 'cucumber-tsflow.js');
		// The progress lines carry the rerun note; without a TTY they are plain, append-only text
		const env: Record<string, string | undefined> = { ...process.env, TSFLOW_THEME: 'pickle', FORCE_COLOR: '0' };
		delete env.TSFLOW_TIMING;
		// In-process reruns need the ESM loader hooks on the main thread. The CI job that forces them onto
		// Node's hooks thread would otherwise turn the in-process scenario into the child-process fallback
		delete env.TSFLOW_ESM_HOOKS;
		const child = spawn(process.execPath, [bin, '-p', profile, '--watch'], {
			cwd: process.cwd(),
			env,
			stdio: ['pipe', 'pipe', 'pipe']
		});
		this.child = child;
		const collect = (chunk: Buffer): void => {
			this.output += chunk.toString();
			this.runs = this.output.match(RUN_FINISHED)?.length ?? 0;
			for (const waiter of this.waiters.splice(0)) {
				if (this.runs >= waiter.runs) waiter.resolve();
				else this.waiters.push(waiter);
			}
		};
		child.stdout?.on('data', collect);
		child.stderr?.on('data', collect);
		this.exited = new Promise(resolve => child.on('exit', code => resolve(code)));
	}

	/** Resolves once `count` runs have finished. */
	waitForRuns(count: number): Promise<void> {
		if (this.runs >= count) return Promise.resolve();
		return new Promise(resolve => this.waiters.push({ runs: count, resolve }));
	}

	send(keys: string): void {
		this.child?.stdin?.write(keys);
	}

	/** Append a comment to a file under the working directory, which the watch loop should notice. */
	edit(relativePath: string): void {
		const file = path.resolve(process.cwd(), relativePath);
		if (!this.originals.has(file)) {
			const stat = fs.statSync(file);
			this.originals.set(file, { content: fs.readFileSync(file), atime: stat.atime, mtime: stat.mtime });
		}
		fs.appendFileSync(file, `\r\n// touched by the watch spec at ${new Date().toISOString()}\r\n`);
	}

	/** Put every edited file back, content and timestamps, so the tree and the selective-load stamps read as before. */
	restore(): void {
		for (const [file, original] of this.originals) {
			fs.writeFileSync(file, original.content);
			fs.utimesSync(file, original.atime, original.mtime);
		}
		this.originals.clear();
	}

	/** What the process printed during run `run` (1-based): everything up to that run's `Run took` line. */
	outputOfRun(run: number): string {
		const segments = this.output.split(/Run took [^\n]*\n/);
		return segments[run - 1] ?? '';
	}

	async quit(): Promise<void> {
		this.send('q');
		this.exitCode = await this.exited;
	}

	kill(): void {
		if (this.child && this.child.exitCode === null) this.child.kill();
	}
}

@binding([WatchSession])
export default class WatchModeSteps {
	constructor(private readonly session: WatchSession) {}

	@given('a watch session on the {string} profile has completed its first run', undefined, RUN_TIMEOUT_MS)
	async startSession(profile: string): Promise<void> {
		this.session.start(profile);
		await this.session.waitForRuns(1);
	}

	@when('I press Enter and wait for the run to finish', undefined, RUN_TIMEOUT_MS)
	async pressEnter(): Promise<void> {
		const target = this.session.runs + 1;
		this.session.send('\n');
		await this.session.waitForRuns(target);
	}

	@when('I append a comment to {string} and wait for the run to finish', undefined, RUN_TIMEOUT_MS)
	async editFile(relativePath: string): Promise<void> {
		const target = this.session.runs + 1;
		this.session.edit(relativePath);
		await this.session.waitForRuns(target);
	}

	@when('I quit the watch session', undefined, 30000)
	async quitSession(): Promise<void> {
		await this.session.quit();
	}

	@then('the session ran {int} times')
	verifyRunCount(count: number): void {
		expect(this.session.runs).to.equal(count);
	}

	@then('every run reported {int} scenarios passed')
	verifyEveryRunPassed(scenarios: number): void {
		const summaries = Array.from(this.session.output.matchAll(/(\d+) scenarios? \(([^)]*)\)/g));
		expect(summaries.length, this.session.output).to.equal(this.session.runs);
		for (const [, count, outcome] of summaries) {
			expect(Number(count)).to.equal(scenarios);
			expect(outcome).to.equal(`${scenarios} passed`);
		}
	}

	@then('each rerun evaluated {int} support files again and kept {int} loaded')
	verifyRerunNotes(evaluated: number, kept: number): void {
		const notes = Array.from(this.session.output.matchAll(RERUN_NOTE));
		expect(notes.length, this.session.output).to.equal(this.session.runs - 1);
		notes.forEach(([, generation, evaluatedAgain, keptLoaded], index) => {
			expect(Number(generation)).to.equal(index + 1);
			expect(Number(evaluatedAgain)).to.equal(evaluated);
			expect(Number(keptLoaded)).to.equal(kept);
		});
	}

	@then('rerun {int} re-evaluated {int} other module(s)')
	verifyOtherModules(rerun: number, modules: number): void {
		const notes = Array.from(this.session.output.matchAll(RERUN_NOTE));
		const note = notes.find(([, generation]) => Number(generation) === rerun);
		expect(note, `no note for rerun ${rerun} in:\n${this.session.output}`).to.not.equal(undefined);
		expect(Number(note?.[4] ?? 0)).to.equal(modules);
	}

	@then('rerun {int} was triggered by a change to {string}')
	verifyChangedLine(rerun: number, relativePath: string): void {
		const printed = slashes(this.session.outputOfRun(rerun + 1));
		expect(printed, this.session.output).to.include(`Changed: ${slashes(relativePath)}`);
	}

	@then('rerun {int} was not triggered by a file change')
	verifyNoChangedLine(rerun: number): void {
		expect(this.session.outputOfRun(rerun + 1), this.session.output).to.not.include('Changed:');
	}

	@then('the session announced that the support code cannot be kept loaded between runs')
	verifyFallbackBanner(): void {
		expect(this.session.output).to.include(FALLBACK_BANNER);
	}

	@then('the session kept the support code loaded between runs')
	verifyNoFallbackBanner(): void {
		expect(this.session.output).to.not.include(FALLBACK_BANNER);
	}

	@then('no rerun note was printed')
	verifyNoRerunNotes(): void {
		expect(this.session.output.match(RERUN_NOTE) ?? []).to.have.length(0);
	}

	@then('every run failed to load the support code')
	verifyEveryRunFailedToLoad(): void {
		// The load phase closes with ` failed, <elapsed>` on each run whose support code did not load
		const failures = this.session.output.match(/ failed, \d+/g) ?? [];
		expect(failures.length, this.session.output).to.equal(this.session.runs);
	}

	@then('nothing was printed after the session stopped')
	verifyQuietStop(): void {
		const stopped = 'Watch mode stopped.';
		const index = this.session.output.lastIndexOf(stopped);
		expect(index, this.session.output).to.be.greaterThan(-1);
		expect(this.session.output.slice(index + stopped.length).trim()).to.equal('');
	}

	@then('the session exited with code {int}')
	verifyExitCode(code: number): void {
		expect(this.session.exitCode).to.equal(code);
	}

	@after('@watch')
	stopSession(): void {
		this.session.kill();
		this.session.restore();
	}
}
