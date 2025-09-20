import { Command } from 'commander';
import merge from 'lodash.merge';
import path from 'path';
import { dialects } from '@cucumber/gherkin';
import { documentation } from '@cucumber/cucumber/lib/formatter/builtin/index';
import { version } from '../version';
import { IConfiguration } from '@cucumber/cucumber/lib/configuration/types';

export interface IParsedArgvOptions {
	config?: string;
	i18nKeywords?: string;
	i18nLanguages?: boolean;
	profile?: string[];
}

export interface ITsflowConfiguration extends IConfiguration {
	debugFile: string;
	transpiler: string;
	enableVueStyle: boolean;
	experimentalDecorators: boolean;
}

export interface IParsedArgv {
	options: IParsedArgvOptions;
	configuration: Partial<ITsflowConfiguration>;
}

type IRawArgvOptions = Partial<Omit<ITsflowConfiguration, 'paths'>> & IParsedArgvOptions;

const ArgvParser = {
	collect<T>(val: T, memo: T[] = []): T[] | undefined {
		if (val) {
			return [...memo, val];
		}
		return undefined;
	},

	mergeJson(option: string): (str: string, memo?: object) => object {
		return function (str: string, memo: object = {}) {
			let val: object;
			try {
				val = JSON.parse(str);
			} catch (error) {
				const e: Error = error as Error;
				throw new Error(`${option} passed invalid JSON: ${e.message}: ${str}`);
			}
			if (typeof val !== 'object' || Array.isArray(val)) {
				throw new Error(`${option} must be passed JSON of an object: ${str}`);
			}
			return merge(memo, val);
		};
	},

	mergeTags(value: string, memo?: string): string {
		return memo ? `${memo} and (${value})` : `(${value})`;
	},

	validateCountOption(value: string, optionName: string): number {
		const numericValue = parseInt(value);
		if (isNaN(numericValue) || numericValue < 0) {
			throw new Error(`${optionName} must be a non negative integer`);
		}
		return numericValue;
	},

	validateLanguage(value: string): string {
		if (!Object.keys(dialects).includes(value)) {
			throw new Error(`Unsupported ISO 639-1: ${value}`);
		}
		return value;
	},

	parse(argv: string[]): IParsedArgv {
		const program = new Command(path.basename(argv[1]));

		program
			.storeOptionsAsProperties(false)
			.usage('[options] [<GLOB|DIR|FILE[:LINE]>...]')
			.version(version, '-v, --version')
			.option('-b, --backtrace', 'show full backtrace for errors')
			.option('-c, --config <PATH>', 'specify configuration file')
			.option('-d, --dry-run', 'invoke formatters without executing steps')
			.option('--debug-file <STRING>', 'path to a file with steps for debugging')
			.option('--enable-vue-style', 'Enable Vue Style block when compiling Vue SFC. Defaults to false.')
			.option(
				'--exit, --force-exit',
				'force shutdown of the event loop when the test run has finished: cucumber will call process.exit'
			)
			.option(
				'--experimental-decorators',
				'Enable TypeScript Experimental Decorators when transpiling. Defaults to false.'
			)
			.option('--fail-fast', 'abort the run on first failure')
			.option(
				'-f, --format <TYPE[:PATH]>',
				'specify the output format, optionally supply PATH to redirect formatter output (repeatable).  Available formats:\n' +
					Object.entries(documentation).reduce(
						(previous, [key, description]) => previous + `    ${key}: ${description}\n`,
						''
					),
				(ArgvParser as any).collect
			)
			.option(
				'--format-options <JSON>',
				'provide options for formatters (repeatable)',
				ArgvParser.mergeJson('--format-options')
			)
			.option('--i18n-keywords <ISO 639-1>', 'list language keywords', ArgvParser.validateLanguage)
			.option('--i18n-languages', 'list languages')
			.option(
				'-i, --import <GLOB|DIR|FILE>',
				'import files before executing features (repeatable)',
				(ArgvParser as any).collect
			)
			.option('--language <ISO 639-1>', 'provide the default language for feature files')
			.option(
				'--name <REGEXP>',
				'only execute the scenarios with name matching the expression (repeatable)',
				(ArgvParser as any).collect
			)
			.option('--order <TYPE[:SEED]>', 'run scenarios in the specified order. Type should be `defined` or `random`')
			.option('-p, --profile <NAME>', 'specify the profile to use (repeatable)', (ArgvParser as any).collect, [])
			.option('--parallel <NUMBER_OF_WORKERS>', 'run in parallel with the given number of workers', val =>
				ArgvParser.validateCountOption(val, '--parallel')
			)
			.option('--publish', 'Publish a report to https://reports.cucumber.io')
			.option(
				'-r, --require <GLOB|DIR|FILE>',
				'require files before executing features (repeatable)',
				(ArgvParser as any).collect
			)
			.option(
				'--require-module <NODE_MODULE>',
				'require node modules before requiring files (repeatable)',
				(ArgvParser as any).collect
			)
			.option(
				'--retry <NUMBER_OF_RETRIES>',
				'specify the number of times to retry failing test cases (default: 0)',
				val => ArgvParser.validateCountOption(val, '--retry')
			)
			.option(
				'--retry-tag-filter <EXPRESSION>',
				`only retries the features or scenarios with tags matching the expression (repeatable).
        This option requires '--retry' to be specified.`,
				ArgvParser.mergeTags
			)
			.option('--strict', 'fail if there are pending steps')
			.option('--no-strict', 'succeed even if there are pending steps')
			.option(
				'-t, --tags <EXPRESSION>',
				'only execute the features or scenarios with tags matching the expression (repeatable)',
				ArgvParser.mergeTags
			)
			.option(
				'--transpiler <ES-NODE|TS-NODE|ES-VUE|TS-VUE|TS-VUE-ESM|ES-NODE-ESM|ES-VUE-ESM>',
				`built-in transpiler to use. ESxxx transpilers use esbuild and TSxxx transpilers use typescript.\n
				Vue versions of the transpilers add a hook for .vue transforms and initialize jsdom globally.\n
				Default: ESNODE (esbuild without Vue support)`
			)
			.option(
				'--world-parameters <JSON>',
				'provide parameters that will be passed to the world constructor (repeatable)',
				ArgvParser.mergeJson('--world-parameters')
			);

		program.addHelpText(
			'afterAll',
			'For more details please visit https://github.com/cucumber/cucumber-js/blob/main/docs/cli.md'
		);

		program.parse(argv);
		const { config, i18nKeywords, i18nLanguages, profile, ...regularStuff }: IRawArgvOptions = program.opts();
		const configuration: Partial<ITsflowConfiguration> = regularStuff;
		if (program.args.length > 0) {
			configuration.paths = program.args;
		}

		return {
			options: {
				config,
				i18nKeywords,
				i18nLanguages,
				profile
			},
			configuration
		};
	}
};

export default ArgvParser;
