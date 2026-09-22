import { ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { after, binding, given, then, when } from '@lynxwall/cucumber-tsflow';
import { expect } from 'chai';

/** The first run of a fresh process on a busy machine can take a while; the reruns are quick. */
const RUN_TIMEOUT_MS = 120000;

/** Printed by the watch loop once after every completed run. */
const RUN_FINISHED = /Run took /g;

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

	start(profile: string): void {
		const packageRoot = path.dirname(require.resolve('@lynxwall/cucumber-tsflow/package.json'));
		const bin = path.join(packageRoot, 'bin', 'cucumber-tsflow.js');
		// The progress lines carry the rerun note; without a TTY they are plain, append-only text
		const env = { ...process.env, TSFLOW_THEME: 'pickle', FORCE_COLOR: '0' };
		delete env.TSFLOW_TIMING;
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
		const notes = Array.from(this.session.output.matchAll(/\(rerun (\d+): (\d+) evaluated again, (\d+) kept loaded/g));
		expect(notes.length, this.session.output).to.equal(this.session.runs - 1);
		notes.forEach(([, generation, evaluatedAgain, keptLoaded], index) => {
			expect(Number(generation)).to.equal(index + 1);
			expect(Number(evaluatedAgain)).to.equal(evaluated);
			expect(Number(keptLoaded)).to.equal(kept);
		});
	}

	@then('the session exited with code {int}')
	verifyExitCode(code: number): void {
		expect(this.session.exitCode).to.equal(code);
	}

	@after('@watch')
	stopSession(): void {
		this.session.kill();
	}
}
