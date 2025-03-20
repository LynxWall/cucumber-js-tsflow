import { IdGenerator } from '@cucumber/messages';
import { IFormatterStream } from '@cucumber/cucumber/lib/formatter/index';
import { IRunOptions } from '@cucumber/cucumber/lib/api/index';
import { runCucumber } from '../cucumber/run-cucumber';
import { loadConfiguration } from './load-configuration';
import { getKeywords, getLanguages } from '@cucumber/cucumber/lib/cli/i18n';
import { validateInstall } from '@cucumber/cucumber/lib/cli/install_validator';
import { resolvePaths } from '@cucumber/cucumber/lib/paths/index';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import { makeEnvironment } from '@cucumber/cucumber/lib/environment/index';
import { getSupportCodeLibrary } from '@cucumber/cucumber/lib/api/support';
import { BindingRegistry } from '../bindings/binding-registry';
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
		consoleLogger.info('Loading configuration and step definitions...\n');

		const { useConfiguration: configuration, runConfiguration } = await loadConfiguration(
			{
				file: options.config,
				profiles: options.profile,
				provided: argvConfiguration
			},
			environment
		);
		// set our global parameter used by the Vue transpiler
		// to determine if Vue Style Blocks should be enabled
		global.enableVueStyle = configuration.enableVueStyle;

		// get run options
		const { cwd, logger } = makeEnvironment(environment);
		const newId = IdGenerator.uuid();
		const runOptions = runConfiguration as IRunOptions;
		const supportCoordinates =
			'originalCoordinates' in runOptions.support
				? runOptions.support.originalCoordinates
				: Object.assign(
						{
							requireModules: [],
							requirePaths: [],
							loaders: [],
							importPaths: []
						},
						runOptions.support
					);
		const resolvedPaths = await resolvePaths(logger, cwd, runOptions.sources, supportCoordinates);
		const { sourcePaths, requirePaths, importPaths } = resolvedPaths;

		logger.debug(process.version);

		// Load the step and hook definitions
		const supportCodeLibrary =
			'originalCoordinates' in runOptions.support
				? (runOptions.support as SupportCodeLibrary)
				: await getSupportCodeLibrary({
						logger,
						cwd,
						newId,
						requirePaths,
						requireModules: supportCoordinates.requireModules,
						importPaths,
						loaders: supportCoordinates.loaders
					});

		// Set support to the updated step and hook definitions
		// in the supportCodeLibrary. We also need to initialize originalCoordinates
		// to support parallel execution.
		runOptions.support = BindingRegistry.instance.updateSupportCodeLibrary(supportCodeLibrary);
		runOptions.support = { ...runOptions.support, ...{ originalCoordinates: supportCoordinates } };

		// now we can run cucumber
		const { success } = await runCucumber(runOptions, environment);
		return {
			shouldExitImmediately: configuration.forceExit,
			success
		};
	}
}
