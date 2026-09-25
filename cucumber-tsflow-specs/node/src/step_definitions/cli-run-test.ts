import { ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, binding, given, then, when } from '@lynxwall/cucumber-tsflow';
import { expect } from 'chai';

/** A fresh CLI process on a busy machine can take a while to bootstrap. */
const RUN_TIMEOUT_MS = 120000;

/** Forward slashes, so that a path the CLI printed reads the same on Windows and Linux. */
function slashes(text: string): string {
	return text.replace(/\\/g, '/');
}

/**
 * One plain `cucumber-tsflow` run as a child process: what it printed on each stream and how it exited.
 */
class CliRun {
	public stdout = '';
	public stderr = '';
	public exitCode: number | null | undefined;
	private child: ChildProcess | undefined;
	/** Files written by a `generated support file` step, removed after the scenario. */
	private readonly generated: string[] = [];

	/** Write a support file that does not compile, so a run can fail on it without a broken file sitting in the tree. */
	generateSyntaxError(relativePath: string): void {
		const file = path.resolve(process.cwd(), relativePath);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		const lines = [
			"import { binding, given } from '@lynxwall/cucumber-tsflow';",
			'',
			'@binding()',
			'export default class GeneratedSyntaxError {',
			"	@given('a step in a file that does not compile')",
			'	step(): void {',
			"		console.log('unbalanced'",
			'	}',
			'}',
			''
		];
		fs.writeFileSync(file, lines.join('\r\n'));
		this.generated.push(file);
	}

	removeGenerated(): void {
		const directories = new Set<string>();
		for (const file of this.generated.splice(0)) {
			fs.rmSync(file, { force: true });
			directories.add(path.dirname(file));
		}
		// Leave no empty directory behind either; one that still holds other files stays
		for (const directory of directories) {
			if (fs.existsSync(directory) && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
		}
	}

	run(args: string[]): Promise<void> {
		const packageRoot = path.dirname(require.resolve('@lynxwall/cucumber-tsflow/package.json'));
		const bin = path.join(packageRoot, 'bin', 'cucumber-tsflow.js');
		// Without a TTY the startup phases are plain, append-only lines in the default theme
		const env: Record<string, string | undefined> = { ...process.env, TSFLOW_THEME: 'pickle', FORCE_COLOR: '0' };
		delete env.TSFLOW_TIMING;
		this.stdout = '';
		this.stderr = '';
		this.exitCode = undefined;
		const child = spawn(process.execPath, [bin, ...args], { cwd: process.cwd(), env, stdio: ['pipe', 'pipe', 'pipe'] });
		this.child = child;
		child.stdout?.on('data', (chunk: Buffer) => (this.stdout += chunk.toString()));
		child.stderr?.on('data', (chunk: Buffer) => (this.stderr += chunk.toString()));
		return new Promise(resolve =>
			child.on('exit', code => {
				this.exitCode = code;
				resolve();
			})
		);
	}

	/** The load-phase line (on stderr): how many support files were loaded and any note appended to it. */
	loadLine(): string {
		const line = this.stderr.split(/\r?\n/).find(text => text.includes('transpiling and loading'));
		expect(line, this.stderr).to.not.equal(undefined);
		return line ?? '';
	}

	kill(): void {
		if (this.child && this.child.exitCode === null) this.child.kill();
	}
}

@binding([CliRun])
export default class CliRunSteps {
	constructor(private readonly run: CliRun) {}

	@given('a generated support file {string} with a syntax error')
	generateBrokenFile(relativePath: string): void {
		this.run.generateSyntaxError(relativePath);
	}

	@given('the {string} profile has run once to write its selective-load index', undefined, RUN_TIMEOUT_MS)
	async warmIndex(profile: string): Promise<void> {
		await this.run.run(['-p', profile]);
		expect(this.run.exitCode, this.run.stdout + this.run.stderr).to.equal(0);
	}

	@when('I run the {string} profile', undefined, RUN_TIMEOUT_MS)
	async runProfile(profile: string): Promise<void> {
		await this.run.run(['-p', profile]);
	}

	@when('I run the {string} profile with {string}', undefined, RUN_TIMEOUT_MS)
	async runProfileWith(profile: string, option: string): Promise<void> {
		await this.run.run(['-p', profile, ...option.split(' ')]);
	}

	@then('the run loaded {int} of {int} support files and skipped {int}')
	verifySelectiveLoad(loaded: number, total: number, skipped: number): void {
		const line = this.run.loadLine();
		expect(line).to.include(`loading ${loaded} of ${total} support files`);
		expect(line).to.include(`(${skipped} skipped: not used by the selected scenarios)`);
	}

	@then('the run loaded all {int} support files')
	verifyFullLoad(total: number): void {
		const line = this.run.loadLine();
		expect(line).to.include(`loading ${total} support files with`);
		expect(line).to.not.include(`of ${total} support files`);
		expect(line).to.not.include('skipped');
	}

	@then('the run reported {int} scenarios passed')
	verifyPassed(scenarios: number): void {
		expect(this.run.stdout).to.include(`${scenarios} scenarios (${scenarios} passed)`);
	}

	@then('the run exited with code {int}')
	verifyExitCode(code: number): void {
		expect(this.run.exitCode, this.run.stdout + this.run.stderr).to.equal(code);
	}

	@then('the parse phase reported {int} parse error(s)')
	verifyParseErrorCount(count: number): void {
		// The parse phase's summary, on stderr with the rest of the startup progress
		expect(this.run.stderr).to.include(count === 1 ? '1 parse error' : `${count} parse errors`);
	}

	@then('the error output reports a parse error in {string}')
	verifyParseErrorMessage(featurePath: string): void {
		expect(slashes(this.run.stderr)).to.include(`Parse error in "${featurePath}"`);
	}

	@then('the message stream {string} holds only the meta, source and parseError envelopes')
	verifyMessageStream(reportPath: string): void {
		const lines = fs
			.readFileSync(path.resolve(process.cwd(), reportPath), 'utf8')
			.split(/\r?\n/)
			.filter(line => line.length > 0);
		const kinds = lines.map(line => Object.keys(JSON.parse(line))[0]);
		expect(kinds).to.deep.equal(['meta', 'source', 'parseError']);
	}

	@then('the load phase failed')
	verifyLoadFailed(): void {
		expect(this.run.loadLine()).to.match(/ failed, \d+/);
	}

	@then('the error output names {string}')
	verifyErrorNamesFile(relativePath: string): void {
		expect(slashes(this.run.stderr)).to.include(slashes(relativePath));
	}

	@then('the error output names {string} exactly once')
	verifyErrorNamesFileOnce(relativePath: string): void {
		const occurrences = slashes(this.run.stderr).split(slashes(relativePath)).length - 1;
		expect(occurrences, this.run.stderr).to.equal(1);
	}

	@then('no scenario ran')
	verifyNothingRan(): void {
		// The progress formatter's summary counts scenarios in parentheses once at least one has run
		expect(this.run.stdout).to.not.match(/[1-9]\d* scenarios? \(/);
	}

	@then('the BeforeAll hook output starts on its own line')
	verifyHookOutputOnOwnLine(): void {
		// The launch phase line (stderr) closes before the hooks run, so what a hook prints (stdout) starts its own line
		const launchLine = this.run.stderr.split(/\r?\n/).find(text => text.includes('assembling'));
		expect(launchLine, this.run.stderr).to.not.equal(undefined);
		expect(launchLine).to.not.include('beforeAll was called');
		expect(this.run.stdout).to.match(/^beforeAll was called/m);
	}

	@then('the output holds no escape sequences')
	verifyNoEscapes(): void {
		// Neither the formatter's stdout nor the startup progress on stderr redraws anything without a TTY
		// eslint-disable-next-line no-control-regex
		expect(this.run.stdout + this.run.stderr).to.not.match(/\x1b/);
	}

	@after('@cli-run')
	stopRun(): void {
		this.run.kill();
		this.run.removeGenerated();
	}
}
