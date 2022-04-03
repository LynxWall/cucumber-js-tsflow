import { defineParameterType } from '@cucumber/cucumber/lib/index';
import * as messages from '@cucumber/messages';
import { isTruthyString } from '@cucumber/cucumber/lib/configuration/index';
import { IFormatterStream } from '@cucumber/cucumber/lib/formatter';
import { IRunOptions, runCucumber } from '@cucumber/cucumber/lib/api/index';
import { loadConfiguration } from './load-configuration';
import { getKeywords, getLanguages } from '@cucumber/cucumber/lib/cli/i18n';
import { validateInstall } from '@cucumber/cucumber/lib/cli/install_validator';
import { resolvePaths } from '@cucumber/cucumber/lib/api/paths';
import { mergeEnvironment } from '@cucumber/cucumber/lib/api/environment';
import { getSupportCodeLibrary } from '@cucumber/cucumber/lib/api/support';
import { BindingRegistry } from '../cucumber/binding-registry';
import ArgvParser from './argv-parser';

export interface ICliRunResult {
	shouldAdvertisePublish: boolean;
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
		stderr,
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
		await validateInstall(this.cwd);
		const { options, configuration: argvConfiguration } = ArgvParser.parse(this.argv);
		if (options.i18nLanguages) {
			(this.stdout as any).write(getLanguages());
			return {
				shouldAdvertisePublish: false,
				shouldExitImmediately: true,
				success: true
			};
		}
		if (options.i18nKeywords) {
			(this.stdout as any).write(getKeywords(options.i18nKeywords));
			return {
				shouldAdvertisePublish: false,
				shouldExitImmediately: true,
				success: true
			};
		}
		const environment = {
			cwd: this.cwd,
			stdout: this.stdout,
			stderr: this.stderr,
			env: this.env
		};
		const { useConfiguration: configuration, runConfiguration } = await loadConfiguration(
			{
				file: options.config,
				profiles: options.profile,
				provided: argvConfiguration
			},
			environment
		);

		// get run options
		const { cwd } = mergeEnvironment(environment);
		const newId = messages.IdGenerator.uuid();
		const runOptions = runConfiguration as IRunOptions;
		const supportCoordinates =
			'World' in runOptions.support ? runOptions.support.originalCoordinates : runOptions.support;
		const { requirePaths, importPaths } = await resolvePaths(cwd, runOptions.sources, supportCoordinates);

		// Load the step and hook definitions
		const supportCodeLibrary =
			'World' in runOptions.support
				? runOptions.support
				: await getSupportCodeLibrary({
						cwd,
						newId,
						requirePaths,
						importPaths,
						requireModules: supportCoordinates.requireModules
				  });

		// Set support to the updated step and hook definitions
		// in the supportCodeLibrary
		runOptions.support = BindingRegistry.instance.updateSupportCodeLibrary(supportCodeLibrary);

		// define a custom boolean type this has to be done
		// after all of the definitions have been loaded
		defineParameterType({
			name: 'boolean',
			regexp: /true|false/,
			transformer: s => (s === 'true' ? true : false)
		});

		// now we can run cucumber
		const { success } = await runCucumber(runOptions, environment);
		return {
			shouldAdvertisePublish:
				!runConfiguration.formats.publish &&
				!configuration.publishQuiet &&
				!isTruthyString(this.env.CUCUMBER_PUBLISH_QUIET),
			shouldExitImmediately: configuration.forceExit,
			success
		};
	}
}
