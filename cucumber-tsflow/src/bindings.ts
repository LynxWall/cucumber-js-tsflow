/**
 * Support-code entry point
 *
 * @packageDocumentation
 * @module bindings
 * @remarks
 * Everything a step-definition file needs — the decorators, the context classes and the CucumberJS
 * support-code helpers — without the formatters, snippet syntax and CLI that the package root also loads.
 * The entry point is `@lynxwall/cucumber-tsflow/bindings`; the package root re-exports all of it.
 */
import * as messages from '@cucumber/messages';
import * as parallelCanAssignHelpers from '@cucumber/cucumber/lib/support_code_library_builder/parallel_can_assign_helpers';
import supportCodeLibraryBuilder from '@cucumber/cucumber/lib/support_code_library_builder/index';

// Top level
export { default as supportCodeLibraryBuilder } from '@cucumber/cucumber/lib/support_code_library_builder/index';
export { default as DataTable } from '@cucumber/cucumber/lib/models/data_table';
export { default as TestCaseHookDefinition } from '@cucumber/cucumber/lib/models/test_case_hook_definition';

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
