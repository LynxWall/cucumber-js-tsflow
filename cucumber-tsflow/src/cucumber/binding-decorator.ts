/* eslint-disable prefer-rest-params */
import {
	After,
	AfterStep,
	AfterAll,
	Before,
	BeforeStep,
	BeforeAll,
	Given,
	Then,
	When,
	World
} from '@cucumber/cucumber';

import { BindingRegistry, DEFAULT_TAG } from './binding-registry';
import { StepBinding, StepBindingFlags } from '../types/step-binding';
import { ContextType, StepPattern, TypeDecorator } from '../types/types';
import messageCollector from './message-collector';
interface WritableWorld extends World {
	[key: string]: any;
}

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
 * Binds a step definition to Cucumber.
 *
 * @param stepBinding The [[StepBinding]] that represents a 'given', 'when', or 'then' step definition.
 */
function bindStepDefinition(stepBinding: StepBinding): void {
	const bindingFunc = function (this: WritableWorld): any {
		const bindingRegistry = BindingRegistry.instance;

		const scenarioContext = messageCollector.getStepScenarioContext(stepBinding);
		if (scenarioContext) {
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
		} else {
			throw new Error('Unable to find the Scenario Context for Hook!');
		}
	};

	Object.defineProperty(bindingFunc, 'length', {
		value: stepBinding.argsLength
	});

	// initialize options used on all step bindings
	const options = {
		cucumberKey: stepBinding.cucumberKey,
		timeout: stepBinding.timeout,
		wrapperOptions: stepBinding.wrapperOption
	};
	// call appropriate step
	if (stepBinding.bindingType & StepBindingFlags.given) {
		Given(stepBinding.stepPattern, options, bindingFunc);
	} else if (stepBinding.bindingType & StepBindingFlags.when) {
		When(stepBinding.stepPattern, options, bindingFunc);
	} else if (stepBinding.bindingType & StepBindingFlags.then) {
		Then(stepBinding.stepPattern, options, bindingFunc);
	}
}

/**
 * Binds a hook to Cucumber.
 *
 * @param stepBinding The [[StepBinding]] that represents a 'before', or 'after', step definition.
 */
function bindHook(stepBinding: StepBinding): void {
	const bindingFunc =
		stepBinding.bindingType == StepBindingFlags.beforeAll || stepBinding.bindingType == StepBindingFlags.afterAll
			? function (this: any): any {
					return stepBinding.targetPrototype[stepBinding.targetPropertyKey].apply() as () => void;
			  }
			: function (this: any, arg: any): any {
					const scenarioContext = messageCollector.getHookScenarioContext(arg);
					if (scenarioContext) {
						const contextTypes = BindingRegistry.instance.getContextTypesForTarget(stepBinding.targetPrototype);
						const bindingObject = scenarioContext.getOrActivateBindingClass(stepBinding.targetPrototype, contextTypes);
						bindingObject._worldObj = this;
						return (bindingObject[stepBinding.targetPropertyKey] as () => void).apply(bindingObject, arguments as any);
					} else {
						throw new Error('Unable to find the Scenario Context for Hook!');
					}
			  };
	Object.defineProperty(bindingFunc, 'length', {
		value: stepBinding.argsLength
	});

	const tags = stepBinding.tags === DEFAULT_TAG ? undefined : stepBinding.tags;

	switch (stepBinding.bindingType) {
		case StepBindingFlags.beforeAll: {
			const options = { cucumberKey: stepBinding.cucumberKey, timeout: stepBinding.timeout };
			BeforeAll(options, bindingFunc);
			break;
		}
		case StepBindingFlags.before: {
			const options = { cucumberKey: stepBinding.cucumberKey, tags: tags, timeout: stepBinding.timeout };
			Before(options, bindingFunc);
			break;
		}
		case StepBindingFlags.beforeStep: {
			const options = { cucumberKey: stepBinding.cucumberKey, tags: tags, timeout: stepBinding.timeout };
			BeforeStep(options, bindingFunc);
			break;
		}
		case StepBindingFlags.afterAll: {
			const options = { cucumberKey: stepBinding.cucumberKey, timeout: stepBinding.timeout };
			AfterAll(options, bindingFunc);
			break;
		}
		case StepBindingFlags.after: {
			const options = { cucumberKey: stepBinding.cucumberKey, tags: tags, timeout: stepBinding.timeout };
			After(options, bindingFunc);
			break;
		}
		case StepBindingFlags.afterStep: {
			const options = { cucumberKey: stepBinding.cucumberKey, tags: tags, timeout: stepBinding.timeout };
			AfterStep(options, bindingFunc);
			break;
		}
	}
}
