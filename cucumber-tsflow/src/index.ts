/**
 * User code functions and helpers
 *
 * @packageDocumentation
 * @module (root)
 * @remarks
 * These docs cover the functions and helpers for user code registration and test setup. The entry point is `@lynxwall/cucumber-tsflow`.
 */
import { deprecate } from 'node:util';
import type { default as CliClass } from './cli';
import * as formatterHelpers from '@cucumber/cucumber/lib/formatter/helpers/index';
import { version as _version } from './version';

// type version as string
export const version = _version as string;

// Decorators, context classes and CucumberJS support-code helpers. Support files that need nothing else
// can import them from `@lynxwall/cucumber-tsflow/bindings` and skip loading the formatters below.
export * from './bindings';

// TsFlow Snippet Syntax and Formatters
export { default as TsflowSnippet } from './formatter/step-definition-snippet-syntax/tsflow-snippet-syntax';
export { default as BehaveFormatter } from './formatter/behave-json-formatter';
export { default as JunitBambooFormatter } from './formatter/junit-bamboo-formatter';

// CucumberJS Formatters
export { default as Formatter, IFormatterOptions } from '@cucumber/cucumber/lib/formatter/index';
export { default as FormatterBuilder } from '@cucumber/cucumber/lib/formatter/builder';
export { default as JsonFormatter } from '@cucumber/cucumber/lib/formatter/json_formatter';
export { default as ProgressFormatter } from '@cucumber/cucumber/lib/formatter/progress_formatter';
export { default as RerunFormatter } from '@cucumber/cucumber/lib/formatter/rerun_formatter';
export { default as SnippetsFormatter } from '@cucumber/cucumber/lib/formatter/snippets_formatter';
export { default as SummaryFormatter } from '@cucumber/cucumber/lib/formatter/summary_formatter';
export { default as UsageFormatter } from '@cucumber/cucumber/lib/formatter/usage_formatter';
export { default as UsageJsonFormatter } from '@cucumber/cucumber/lib/formatter/usage_json_formatter';
export { formatterHelpers };

// Deprecated
/**
 * Constructs the CLI, requiring it on first use so that importing decorators from the package root does not
 * load the CLI, the runtime and everything they pull in.
 */
function constructCli(this: unknown, ...args: ConstructorParameters<typeof CliClass>): CliClass {
	const LoadedCli = (require('./cli') as typeof import('./cli')).default;
	return new LoadedCli(...args);
}

/**
 * @deprecated use `runCucumber` instead; see https://github.com/cucumber/cucumber-js/blob/main/docs/deprecations.md
 */
export const Cli = deprecate(
	constructCli as unknown as typeof CliClass,
	'`Cli` is deprecated, use `runCucumber` instead; see https://github.com/cucumber/cucumber-js/blob/main/docs/deprecations.md'
);
