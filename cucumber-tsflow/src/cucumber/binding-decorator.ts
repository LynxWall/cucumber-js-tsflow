/* eslint-disable prefer-rest-params */
import { After, AfterAll, Before, BeforeAll, Given, Then, When, World } from '@cucumber/cucumber';
import * as messages from '@cucumber/messages';

import * as _ from 'underscore';
import logger from './logger';

import { BindingRegistry, DEFAULT_TAG } from './binding-registry';
import { ManagedScenarioContext } from './managed-scenario-context';
import { StepBinding, StepBindingFlags } from './step-binding';
import { ContextType, StepPattern, TypeDecorator } from './types';
import { PickleTag } from '@cucumber/messages';

interface WritableWorld extends World {
	[key: string]: any;
}

/**
 * The property name of the current scenario context that will be attached to the Cucumber
 * world object.
 */
const SCENARIO_CONTEXT_SLOTNAME = '__SCENARIO_CONTEXT';

/**
 * A set of step patterns that have been registered with Cucumber.
 *
 * In order to support scoped (or tagged) step definitions, we must ensure that any step binding is
 * only registered with Cucumber once. The binding function for that step pattern then becomes
 * responsible for looking up and execuing the step binding based on the context that is in scope at
 * the point of invocation.
 */
const stepPatternRegistrations = new Map<StepPattern, StepBindingFlags>();

// tslint:disable:no-bitwise

/**
 * A class decorator that marks the associated class as a CucumberJS binding.
 *
 * @param requiredContextTypes An optional array of Types that will be created and passed into the created
 * object for each scenario.
 *
 * An instance of the decorated class will be created for each scenario.
 */
export function binding(requiredContextTypes?: ContextType[]): TypeDecorator {
	return <T>(target: { new (...args: any[]): T }) => {
		ensureSystemBindings();
		const bindingRegistry = BindingRegistry.instance;
		bindingRegistry.registerContextTypesForTarget(target.prototype, requiredContextTypes);
		const allBindings: StepBinding[] = [];
		allBindings.push(...bindingRegistry.getStepBindingsForTarget(target));
		allBindings.push(...bindingRegistry.getStepBindingsForTarget(target.prototype));

		allBindings.forEach(stepBinding => {
			if (stepBinding.bindingType & StepBindingFlags.StepDefinitions) {
				let stepBindingFlags = stepPatternRegistrations.get(stepBinding.stepPattern.toString());
				if (stepBindingFlags === undefined) {
					stepBindingFlags = StepBindingFlags.none;
				}
				if (stepBindingFlags & stepBinding.bindingType) {
					return;
				}
				bindStepDefinition(stepBinding);
				stepPatternRegistrations.set(stepBinding.stepPattern.toString(), stepBindingFlags | stepBinding.bindingType);
			} else if (stepBinding.bindingType & StepBindingFlags.Hooks) {
				bindHook(stepBinding);
			}
		});
	};
}

/**
 * Ensures that the 'cucumber-tsflow' hooks are bound to Cucumber.
 *
 * @param cucumber The cucumber object.
 *
 * The hooks will only be registered with Cucumber once regardless of which binding invokes the
 * function.
 */
const ensureSystemBindings = _.once(() => {
	BeforeAll(() => {
		// TODO: register our custom formatters
	});

	Before(function (this: WritableWorld, scenario) {
		logger.trace('Setting up scenario context for scenario:', JSON.stringify(scenario));

		this[SCENARIO_CONTEXT_SLOTNAME] = new ManagedScenarioContext(
			scenario.pickle?.name ?? '',
			_.map(scenario.pickle?.tags ?? new Array<PickleTag>(), (tag: messages.PickleTag) => tag?.name ?? '')
		);
	});

	After(function (this: WritableWorld) {
		const scenarioContext = this[SCENARIO_CONTEXT_SLOTNAME] as ManagedScenarioContext;

		if (scenarioContext) {
			scenarioContext.dispose();
		}
	});
});

/**
 * Binds a step definition to Cucumber.
 *
 * @param stepBinding The [[StepBinding]] that represents a 'given', 'when', or 'then' step definition.
 */
function bindStepDefinition(stepBinding: StepBinding): void {
	const bindingFunc = function (this: WritableWorld): any {
		const bindingRegistry = BindingRegistry.instance;

		const scenarioContext = this[SCENARIO_CONTEXT_SLOTNAME] as ManagedScenarioContext;

		const matchingStepBindings = bindingRegistry.getStepBindings(
			stepBinding.stepPattern.toString(),
			scenarioContext.scenarioInfo.tags
		);

		if (matchingStepBindings.length > 1) {
			let message = `Ambiguous step definitions for '${matchingStepBindings[0].stepPattern}':\n`;

			matchingStepBindings.forEach(matchingStepBinding => {
				message =
					message +
					`\t\t${String(matchingStepBinding.targetPropertyKey)} (${matchingStepBinding.callsite.toString()})\n`;
			});

			throw new Error(message);
		} else if (matchingStepBindings.length === 0) {
			throw new Error(
				`Cannot find matched step definition for ${stepBinding.stepPattern.toString()} with tag ${
					scenarioContext.scenarioInfo.tags
				} in binding registry`
			);
		}

		const contextTypes = bindingRegistry.getContextTypesForTarget(matchingStepBindings[0].targetPrototype);
		const bindingObject = scenarioContext.getOrActivateBindingClass(
			matchingStepBindings[0].targetPrototype,
			contextTypes
		);

		bindingObject._worldObj = this;

		return (bindingObject[matchingStepBindings[0].targetPropertyKey] as () => void).apply(
			bindingObject,
			arguments as any
		);
	};

	Object.defineProperty(bindingFunc, 'length', {
		value: stepBinding.argsLength
	});

	if (stepBinding.bindingType & StepBindingFlags.given) {
		Given(
			stepBinding.stepPattern,
			{
				timeout: stepBinding.timeout,
				wrapperOptions: stepBinding.wrapperOption
			},
			bindingFunc
		);
	} else if (stepBinding.bindingType & StepBindingFlags.when) {
		When(
			stepBinding.stepPattern,
			{
				timeout: stepBinding.timeout,
				wrapperOptions: stepBinding.wrapperOption
			},
			bindingFunc
		);
	} else if (stepBinding.bindingType & StepBindingFlags.then) {
		Then(
			stepBinding.stepPattern,
			{
				timeout: stepBinding.timeout,
				wrapperOptions: stepBinding.wrapperOption
			},
			bindingFunc
		);
	}
}

/**
 * Binds a hook to Cucumber.
 *
 * @param cucumber The cucumber object.
 * @param stepBinding The [[StepBinding]] that represents a 'before', or 'after', step definition.
 */
function bindHook(stepBinding: StepBinding): void {
	const bindingFunc = function (this: any): any {
		const scenarioContext = this[SCENARIO_CONTEXT_SLOTNAME] as ManagedScenarioContext;
		const contextTypes = BindingRegistry.instance.getContextTypesForTarget(stepBinding.targetPrototype);
		const bindingObject = scenarioContext.getOrActivateBindingClass(stepBinding.targetPrototype, contextTypes);

		bindingObject._worldObj = this;

		return (bindingObject[stepBinding.targetPropertyKey] as () => void).apply(bindingObject, arguments as any);
	};

	const globalBindFunc = () => {
		const targetPrototype = stepBinding.targetPrototype;
		const targetPropertyKey = stepBinding.targetPropertyKey;
		return targetPrototype[targetPropertyKey].apply();
	};

	Object.defineProperty(bindingFunc, 'length', {
		value: stepBinding.argsLength
	});

	const tags = stepBinding.tag === DEFAULT_TAG ? undefined : stepBinding.tag;

	switch (stepBinding.bindingType) {
		case StepBindingFlags.before: {
			Before(
				{
					tags: tags,
					timeout: stepBinding.timeout
				},
				bindingFunc
			);
			break;
		}
		case StepBindingFlags.after: {
			After(
				{
					tags: tags,
					timeout: stepBinding.timeout
				},
				bindingFunc
			);
			break;
		}
		case StepBindingFlags.beforeAll: {
			BeforeAll(globalBindFunc);
			break;
		}
		case StepBindingFlags.afterAll: {
			AfterAll(globalBindFunc);
			break;
		}
	}
}
