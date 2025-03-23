/* eslint-disable no-undef */
import { IFormatterStream } from '@cucumber/cucumber/lib/formatter/index';
import { runCucumber } from '../api/run-cucumber';
import { loadConfiguration } from '../api/load-configuration';
import { getKeywords, getLanguages } from '@cucumber/cucumber/lib/cli/i18n';
import { validateInstall } from '@cucumber/cucumber/lib/cli/install_validator';
import ArgvParser from './argv-parser';
import debug from 'debug';
import { Console } from 'console';

export interface ICliRunResult {
	shouldExitImmediately: boolean;
	success: boolean;
}

export default class Cli {
	private readonly argv: string[];
	private readonly cwd: string;
	private readonly stdout: IFormatterStream;
	private readonly stderr: IFormatterStream;
	private readonly env: NodeJS.ProcessEnv;

	constructor({
		argv,
		cwd,
		stdout,
		stderr = process.stderr,
		env
	}: {
		argv: string[];
		cwd: string;
		stdout: IFormatterStream;
		stderr: IFormatterStream;
		env: NodeJS.ProcessEnv;
	}) {
		this.argv = argv;
		this.cwd = cwd;
		this.stdout = stdout;
		this.stderr = stderr;
		this.env = env;
	}

	async run(): Promise<ICliRunResult> {
		const debugEnabled = debug.enabled('cucumber');
		if (debugEnabled) {
			await validateInstall();
		}

		const { options, configuration: argvConfiguration } = ArgvParser.parse(this.argv);
		if (options.i18nLanguages) {
			(this.stdout as any).write(getLanguages());
			return {
				shouldExitImmediately: true,
				success: true
			};
		}
		if (options.i18nKeywords) {
			(this.stdout as any).write(getKeywords(options.i18nKeywords));
			return {
				shouldExitImmediately: true,
				success: true
			};
		}

		const environment = {
			cwd: this.cwd,
			stdout: this.stdout,
			stderr: this.stderr,
			env: this.env,
			debug: debugEnabled
		};
		const consoleLogger = new Console(environment.stdout as any, environment.stderr);
		consoleLogger.info('Loading configuration...');

		const { useConfiguration: configuration, runConfiguration } = await loadConfiguration(
			{
				file: options.config,
				profiles: options.profile,
				provided: argvConfiguration
			},
			environment
		);
		consoleLogger.info('Loading Steps and Running Cucumber...\n');

		// now we can run cucumber
		const { success } = await runCucumber(runConfiguration, environment);
		return {
			shouldExitImmediately: configuration.forceExit,
			success
		};
	}
}
