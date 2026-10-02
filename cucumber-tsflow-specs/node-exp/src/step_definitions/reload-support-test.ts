import { ChildProcess, spawn } from 'node:child_process';
import path from 'node:path';
import { after, binding, given, then, when } from '@lynxwall/cucumber-tsflow';
import { expect } from 'chai';

/** The first load of a fresh process transpiles the driver and the fixtures; the reloads are quick. */
const COMMAND_TIMEOUT_MS = 60000;

/** One reply of the driver process; see src/fixtures/reload-driver.ts. */
interface DriverReply {
	steps?: string[];
	hooks?: number;
	reevaluated?: boolean;
	error?: string;
}

/** The step patterns the two fixture files define, sorted as the driver reports them. */
const FIXTURE_STEPS = ['a reload fixture step', 'a second reload fixture step'];

/**
 * The process a scenario drives through the API: `node -r @lynxwall/cucumber-tsflow/esnode` on the driver,
 * in this workspace, so that the driver and the fixtures are transpiled the way the suite's own files are.
 */
class ReloadDriver {
	private child: ChildProcess | undefined;
	private buffered = '';
	private waiting: ((reply: DriverReply) => void) | undefined;
	/** The reply to the last command. */
	public last: DriverReply = {};

	start(): void {
		const driver = path.resolve('src/fixtures/reload-driver.ts');
		this.child = spawn(process.execPath, ['-r', '@lynxwall/cucumber-tsflow/esnode', driver], {
			cwd: process.cwd(),
			stdio: ['pipe', 'pipe', 'inherit']
		});
		this.child.stdout?.on('data', (chunk: Buffer) => {
			this.buffered += chunk.toString();
			let end = this.buffered.indexOf('\n');
			while (end !== -1) {
				const line = this.buffered.slice(0, end).trim();
				this.buffered = this.buffered.slice(end + 1);
				if (line.startsWith('{')) this.waiting?.(JSON.parse(line) as DriverReply);
				end = this.buffered.indexOf('\n');
			}
		});
	}

	/** Send one command and wait for its reply; a reply carrying an error fails the step. */
	send(command: string): Promise<DriverReply> {
		return new Promise((resolve, reject) => {
			this.waiting = reply => {
				this.waiting = undefined;
				this.last = reply;
				if (reply.error) reject(new Error(`${command}: ${reply.error}`));
				else resolve(reply);
			};
			this.child?.stdin?.write(`${command}\n`);
		});
	}

	stop(): void {
		this.child?.stdin?.end();
		this.child?.kill();
	}
}

@binding([ReloadDriver])
export default class ReloadSupportSteps {
	constructor(private readonly driver: ReloadDriver) {}

	@given('a process that loads the reload fixtures through the API')
	startDriver(): void {
		this.driver.start();
	}

	@when('it calls loadSupport', undefined, COMMAND_TIMEOUT_MS)
	async callLoadSupport(): Promise<void> {
		await this.driver.send('load');
	}

	@given('it has loaded the support code', undefined, COMMAND_TIMEOUT_MS)
	async loadSupportCode(): Promise<void> {
		await this.driver.send('load');
	}

	@when('it calls reloadSupport with no changed paths', undefined, COMMAND_TIMEOUT_MS)
	async fullReload(): Promise<void> {
		await this.driver.send('reload');
	}

	@when('it calls reloadSupport with the first fixture as a changed path', undefined, COMMAND_TIMEOUT_MS)
	async reloadWithChangedPath(): Promise<void> {
		await this.driver.send('reload-changed');
	}

	@then('the library should contain step definitions from both fixture files')
	verifyStepDefinitions(): void {
		expect(this.driver.last.steps).to.deep.equal(FIXTURE_STEPS);
	}

	@then('the library should contain hook definitions')
	verifyHookDefinitions(): void {
		expect(this.driver.last.hooks).to.be.greaterThan(0);
	}

	@then('the fixture module should have been re-evaluated')
	verifyReEvaluation(): void {
		expect(this.driver.last.reevaluated, 'a new module object in require.cache').to.equal(true);
	}

	@after('@reload')
	stopDriver(): void {
		this.driver.stop();
	}
}
