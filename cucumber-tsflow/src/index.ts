/**
 * User code functions and helpers
 *
 * @packageDocumentation
 * @module (root)
 * @remarks
 * These docs cover the functions and helpers for user code registration and test setup. The entry point is `@lynxwall/cucumber-tsflow`.
 */
import { deprecate } from 'node:util';
import * as messages from '@cucumber/messages';
import { default as _Cli } from './cli';
import * as formatterHelpers from '@cucumber/cucumber/lib/formatter/helpers/index';
import * as parallelCanAssignHelpers from '@cucumber/cucumber/lib/support_code_library_builder/parallel_can_assign_helpers';
import supportCodeLibraryBuilder from '@cucumber/cucumber/lib/support_code_library_builder/index';
import { version as _version } from './version';

// type version as string
export const version = _version as string;

// Top level
export { default as supportCodeLibraryBuilder } from '@cucumber/cucumber/lib/support_code_library_builder/index';
export { default as DataTable } from '@cucumber/cucumber/lib/models/data_table';
export { default as TestCaseHookDefinition } from '@cucumber/cucumber/lib/models/test_case_hook_definition';

// TsFlow Snippet Syntax and Formatters
export { default as TsflowSnippet } from './formatter/step-definition-snippit-syntax/tsflow-snippet-syntax';
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

// Tsflow Support Code Functions - replaces CucumberJS hook and step functions
export { binding } from './bindings/binding-decorator';
export { beforeAll, before, beforeStep, afterAll, after, afterStep } from './bindings/hook-decorators';
export { given, when, then } from './bindings/step-decorators';
export { StartTestCaseInfo, EndTestCaseInfo } from './runtime/test-case-info';
export { ScenarioContext, ScenarioInfo } from './runtime/scenario-context';

// Support Code Functions
const { methods } = supportCodeLibraryBuilder;
export const defineParameterType = methods.defineParameterType;
export const setDefaultTimeout = methods.setDefaultTimeout;
export const setDefinitionFunctionWrapper = methods.setDefinitionFunctionWrapper;
export const setWorldConstructor = methods.setWorldConstructor;
export const setParallelCanAssign = methods.setParallelCanAssign;

export { default as World, IWorld, IWorldOptions } from '@cucumber/cucumber/lib/support_code_library_builder/world';
export { IContext } from '@cucumber/cucumber/lib/support_code_library_builder/context';
export { worldProxy as world, contextProxy as context } from '@cucumber/cucumber/lib/runtime/scope/index';
export { parallelCanAssignHelpers };

export {
	ITestCaseHookParameter,
	ITestStepHookParameter
} from '@cucumber/cucumber/lib/support_code_library_builder/types';
export const Status = messages.TestStepResultStatus;

// Time helpers
export { wrapPromiseWithTimeout } from '@cucumber/cucumber/lib/time';

// Deprecated
/**
 * @deprecated use `runCucumber` instead; see https://github.com/cucumber/cucumber-js/blob/main/docs/deprecations.md
 */
export const Cli = deprecate(
	_Cli,
	'`Cli` is deprecated, use `runCucumber` instead; see https://github.com/cucumber/cucumber-js/blob/main/docs/deprecations.md'
);
