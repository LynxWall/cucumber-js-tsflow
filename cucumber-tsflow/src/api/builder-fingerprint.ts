/**
 * A fingerprint of CucumberJS's support-code library builder, taken before and after a support file loads
 * to tell what the file registered. Everything a file registers happens synchronously while it evaluates,
 * so the difference between the two fingerprints is exactly that file's contribution (plus that of any
 * module it pulled in for the first time). Selective loading uses it to decide which files do more than
 * define steps; watch mode uses it to decide which files have to be evaluated again on every run.
 */
import supportCodeLibraryBuilder from '@cucumber/cucumber/lib/support_code_library_builder/index';

/** The parts of the builder's state the fingerprint reads. */
export interface BuilderInternals {
	stepDefinitionConfigs: Array<{ pattern: string | RegExp }>;
	beforeTestCaseHookDefinitionConfigs: unknown[];
	afterTestCaseHookDefinitionConfigs: unknown[];
	beforeTestRunHookDefinitionConfigs: unknown[];
	afterTestRunHookDefinitionConfigs: unknown[];
	beforeTestStepHookDefinitionConfigs: unknown[];
	afterTestStepHookDefinitionConfigs: unknown[];
	parameterTypeRegistry: { parameterTypes: Iterable<unknown> };
	World: unknown;
	defaultTimeout: number;
	parallelCanAssign: unknown;
	definitionFunctionWrapper: unknown;
}

export interface BuilderFingerprint {
	steps: number;
	hooks: number;
	parameterTypes: number;
	World: unknown;
	defaultTimeout: number;
	parallelCanAssign: unknown;
	definitionFunctionWrapper: unknown;
}

/** The builder's internal state, typed. */
export function builderInternals(): BuilderInternals {
	return supportCodeLibraryBuilder as unknown as BuilderInternals;
}

export function builderFingerprint(): BuilderFingerprint {
	const builder = builderInternals();
	let parameterTypes = 0;
	for (const _ of builder.parameterTypeRegistry.parameterTypes) parameterTypes++;
	return {
		steps: builder.stepDefinitionConfigs.length,
		hooks:
			builder.beforeTestCaseHookDefinitionConfigs.length +
			builder.afterTestCaseHookDefinitionConfigs.length +
			builder.beforeTestRunHookDefinitionConfigs.length +
			builder.afterTestRunHookDefinitionConfigs.length +
			builder.beforeTestStepHookDefinitionConfigs.length +
			builder.afterTestStepHookDefinitionConfigs.length,
		parameterTypes,
		World: builder.World,
		defaultTimeout: builder.defaultTimeout,
		parallelCanAssign: builder.parallelCanAssign,
		definitionFunctionWrapper: builder.definitionFunctionWrapper
	};
}

/** Whether anything other than step definitions changed between the two fingerprints. */
export function registeredBeyondSteps(before: BuilderFingerprint, after: BuilderFingerprint): boolean {
	return (
		after.hooks !== before.hooks ||
		after.parameterTypes !== before.parameterTypes ||
		after.World !== before.World ||
		after.defaultTimeout !== before.defaultTimeout ||
		after.parallelCanAssign !== before.parallelCanAssign ||
		after.definitionFunctionWrapper !== before.definitionFunctionWrapper
	);
}
