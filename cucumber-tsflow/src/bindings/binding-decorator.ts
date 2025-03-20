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
import logger from '../utils/logger';
import { getStepBindings } from './binding-context';
import supportCodeLibraryBuilder from '@cucumber/cucumber/lib/support_code_library_builder/index';
import { BindingRegistry, DEFAULT_TAG } from './binding-registry';
import { StepBinding, StepBindingFlags } from '../types/step-binding';
import { ContextType, StepPattern } from '../types/types';
import { defineParameterType } from '@cucumber/cucumber';
import _ from 'underscore';

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

/**
 * A class decorator that marks the associated class as a CucumberJS binding.
 *
 * @param requiredContextTypes An optional array of Types that will be created and passed into the created
 * object for each scenario.
 *
 * An instance of the decorated class will be created for each scenario.
 */
export function binding(requiredContextTypes?: ContextType[]): any {
	return function classDecorator(target: Function, context: ClassDecoratorContext) {
		const bindingRegistry = BindingRegistry.instance;
		bindingRegistry.registerContextTypesForClass(target.prototype, requiredContextTypes);
		var lib = supportCodeLibraryBuilder;
		defineParameters();

		// the class decorator is called last when decorators on a type are initialized. All other decorators
		// are added to DecoratorContext.metadata before this is called.
		// This will get all those bindings and then clear metadata for the next type that's loaded.
		const allBindings: StepBinding[] = getStepBindings(context);
		allBindings.forEach(stepBinding => {
			// Set the class prototype and then register the binding with the prototype
			stepBinding.classPrototype = target.prototype;
			bindingRegistry.registerStepBinding(stepBinding);

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
		return target;
	};
}

/**
 * Called only once to register new parameters. This has to be
 * executed here during binding initialization for cucumber to
 * to use it when matching expressions. Attempting to add it
 * before the test run doesn't work
 */
const defineParameters = _.once(() => {
	defineParameterType({
		name: 'boolean',
		regexp: /true|false/,
		transformer: s => (s === 'true' ? true : false)
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

		const scenarioContext = global.messageCollector.getStepScenarioContext(stepBinding);
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
						`\t\t${String(matchingStepBinding.classPropertyKey)} (${matchingStepBinding.callsite.toString()})\n`;
				});

				throw new Error(message);
			} else if (matchingStepBindings.length === 0) {
				throw new Error(
					`Cannot find matched step definition for ${stepBinding.stepPattern.toString()} with tag ${
						scenarioContext.scenarioInfo.tags
					} in binding registry`
				);
			}

			const contextTypes = bindingRegistry.getContextTypesForClass(matchingStepBindings[0].classPrototype);
			const bindingObject = scenarioContext.getOrActivateBindingClass(
				matchingStepBindings[0].classPrototype,
				contextTypes,
				this
			);
			bindingObject._worldObj = this;

			return (bindingObject[matchingStepBindings[0].classPropertyKey] as Function).apply(
				bindingObject,
				arguments as any
			);
		} else {
			throw new Error('Unable to find the Scenario Context for a Step!');
		}
	};

	Object.defineProperty(bindingFunc, 'length', {
		value: stepBinding.stepArgsLength
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
	// beforeAll and afterAll are called before and after all tests.
	// these can be class instance or static functions
	const globalBindingFunc = function (this: any): any {
		// if the function is static we need to add it to the associated class first
		if (stepBinding.stepIsStatic && !stepBinding.classPrototype[stepBinding.classPropertyKey]) {
			stepBinding.classPrototype[stepBinding.classPropertyKey] = stepBinding.stepFunction;
		}
		return stepBinding.classPrototype[stepBinding.classPropertyKey].apply() as () => void;
	};
	// Main binding for all other steps
	const bindingFunc = function (this: any, arg: any): any {
		const scenarioContext = global.messageCollector.getHookScenarioContext(arg);
		if (scenarioContext) {
			const contextTypes = BindingRegistry.instance.getContextTypesForClass(stepBinding.classPrototype);
			const bindingObject = scenarioContext.getOrActivateBindingClass(stepBinding.classPrototype, contextTypes, this);
			bindingObject._worldObj = this;
			return (bindingObject[stepBinding.classPropertyKey] as Function).apply(bindingObject, arguments as any);
		} else {
			throw new Error('Unable to find the Scenario Context for Hook!');
		}
	};
	// length values need to be added to our binding functions.
	// These are used in cucumber to determine if the function is
	// a callback or promise.
	Object.defineProperty(globalBindingFunc, 'length', {
		value: stepBinding.stepArgsLength
	});
	Object.defineProperty(bindingFunc, 'length', {
		value: stepBinding.stepArgsLength
	});

	const tags = stepBinding.tags === DEFAULT_TAG ? undefined : stepBinding.tags;

	// This binds the appropriate function above to the associated
	// cucumber step functions.
	switch (stepBinding.bindingType) {
		case StepBindingFlags.beforeAll: {
			const options = { cucumberKey: stepBinding.cucumberKey, timeout: stepBinding.timeout };
			BeforeAll(options, globalBindingFunc);
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
			AfterAll(options, globalBindingFunc);
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
