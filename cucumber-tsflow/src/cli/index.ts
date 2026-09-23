/* eslint-disable no-undef */
import { IFormatterStream } from '@cucumber/cucumber/lib/formatter/index';
import { runCucumber } from '../api/run-cucumber';
import { loadConfiguration } from '../api/load-configuration';
import { getKeywords, getLanguages } from '@cucumber/cucumber/lib/cli/i18n';
import { validateInstall } from '@cucumber/cucumber/lib/cli/install_validator';
import ArgvParser from './argv-parser';
import { watchCucumber } from './watch';
import debug from 'debug';
import { createLogger, messageOf } from '../utils/tsflow-logger';
import { startTimer, recordPhase } from '../utils/tsflow-timing';

const logger = createLogger('cli');

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
		logger.checkpoint('Cli constructor', { cwd, argvLength: argv.length });
		this.argv = argv;
		this.cwd = cwd;
		this.stdout = stdout;
		this.stderr = stderr;
		this.env = env;
	}

	async run(): Promise<ICliRunResult> {
		logger.checkpoint('Cli.run() started');

		const debugEnabled = debug.enabled('cucumber');
		logger.checkpoint('Debug status', { debugEnabled });

		if (debugEnabled) {
			logger.checkpoint('Validating install');
			await validateInstall();
			logger.checkpoint('Install validated');
		}

		// Parse argv
		let options: ReturnType<typeof ArgvParser.parse>['options'];
		let argvConfiguration: ReturnType<typeof ArgvParser.parse>['configuration'];

		try {
			logger.checkpoint('Parsing argv', { argv: this.argv });
			const parsed = ArgvParser.parse(this.argv);
			options = parsed.options;
			argvConfiguration = parsed.configuration;
			logger.checkpoint('Argv parsed', { options });
		} catch (error: any) {
			throw new Error(`Failed to parse command line arguments: ${messageOf(error)}`, { cause: error });
		}

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
		logger.checkpoint('Environment constructed', { cwd: this.cwd, debug: debugEnabled });

		// Load configuration
		let configuration: Awaited<ReturnType<typeof loadConfiguration>>['useConfiguration'];
		let runConfiguration: Awaited<ReturnType<typeof loadConfiguration>>['runConfiguration'];

		try {
			logger.checkpoint('Loading configuration', {
				configFile: options.config,
				profiles: options.profile
			});
			const configStart = startTimer();
			const loaded = await loadConfiguration(
				{
					file: options.config,
					profiles: options.profile,
					provided: argvConfiguration
				},
				environment
			);
			configuration = loaded.useConfiguration;
			runConfiguration = loaded.runConfiguration;
			recordPhase('config', configStart);
			logger.checkpoint('Configuration loaded', {
				transpiler: configuration.transpiler,
				loaders: runConfiguration.support?.loaders,
				parallel: runConfiguration.runtime?.parallel
			});
		} catch (error: any) {
			throw new Error(`Failed to load configuration: ${messageOf(error)}`, { cause: error });
		}

		// Watch mode: run, then stay resident and rerun on changes until the user quits
		if (configuration.watch) {
			logger.checkpoint('Running cucumber in watch mode');
			const success = await watchCucumber(runConfiguration, environment, { argv: this.argv });
			return { shouldExitImmediately: false, success };
		}

		// Run cucumber
		try {
			logger.checkpoint('Running cucumber');
			const { success } = await runCucumber(runConfiguration, environment);
			logger.checkpoint('Cucumber completed', { success });

			return {
				shouldExitImmediately: configuration.forceExit,
				success
			};
		} catch (error: any) {
			throw new Error(`Failed during cucumber execution: ${messageOf(error)}`, { cause: error });
		}
	}
}
