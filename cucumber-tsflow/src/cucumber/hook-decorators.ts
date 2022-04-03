import { BindingRegistry } from './binding-registry';
import { Callsite } from '../utils/our-callsite';
import { StepBinding, StepBindingFlags } from '../types/step-binding';
import shortUuid from 'short-uuid';

/**
 * A method decorator that marks the associated function as a 'Before All Scenario' step. The function is
 * executed before all scenarios are executed.
 *
 * @param timeout Optional timeout in milliseconds
 */
export function beforeAll(timeout?: number): MethodDecorator {
	const callSite = Callsite.capture();
	return createDecoratorFactory(StepBindingFlags.beforeAll, callSite, undefined, timeout);
}
/**
 * A method decorator that marks the associated function as a 'Before Scenario' step. The function is
 * executed before each scenario.
 *
 * @param tags Optional tag or tags associated with a scenario.
 * @param timeout Optional timeout in milliseconds
 */
export function before(tags?: string, timeout?: number): MethodDecorator {
	const callSite = Callsite.capture();
	return createDecoratorFactory(StepBindingFlags.before, callSite, tags, timeout);
}
/**
 * A method decorator that marks the associated function as a 'Before Step' step. The function is
 * executed before each step.
 *
 * @param tags Optional tag or tags associated with a scenario.
 * @param timeout Optional timeout in milliseconds
 */
export function beforeStep(tags?: string, timeout?: number): MethodDecorator {
	const callSite = Callsite.capture();
	return createDecoratorFactory(StepBindingFlags.beforeStep, callSite, tags, timeout);
}

/**
 * A method decorator that marks the associated function as an 'After All Scenario' step. The function is
 * executed after all scenarios are executed.
 *
 * @param timeout Optional timeout in milliseconds
 */
export function afterAll(timeout?: number): MethodDecorator {
	const callSite = Callsite.capture();
	return createDecoratorFactory(StepBindingFlags.afterAll, callSite, undefined, timeout);
}
/**
 * A method decorator that marks the associated function as an 'After Scenario' step. The function is
 * executed after each scenario.
 *
 * @param tags Optional tag or tags associated with a scenario.
 * @param timeout Optional timeout in milliseconds
 */
export function after(tags?: string, timeout?: number): MethodDecorator {
	const callSite = Callsite.capture();
	return createDecoratorFactory(StepBindingFlags.after, callSite, tags, timeout);
}
/**
 * A method decorator that marks the associated function as a 'After Step' step. The function is
 * executed after each step.
 *
 * @param tags Optional tag or tags associated with a scenario.
 * @param timeout Optional timeout in milliseconds
 */
export function afterStep(tags?: string, timeout?: number): MethodDecorator {
	const callSite = Callsite.capture();
	return createDecoratorFactory(StepBindingFlags.afterStep, callSite, tags, timeout);
}

function checkTag(tag: string): string {
	return tag;
}

function createDecoratorFactory(flag: StepBindingFlags, callSite: Callsite, tag?: string, timeout?: number) {
	return <T>(target: any, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => {
		const stepBinding: StepBinding = {
			stepPattern: '',
			bindingType: flag,
			targetPrototype: target,
			targetPropertyKey: propertyKey,
			argsLength: target[propertyKey].length,
			timeout: timeout,
			callsite: callSite,
			cucumberKey: shortUuid().new()
		};

		if (tag) {
			stepBinding.tag = checkTag(tag);
		}

		BindingRegistry.instance.registerStepBinding(stepBinding);

		return descriptor;
	};
}
