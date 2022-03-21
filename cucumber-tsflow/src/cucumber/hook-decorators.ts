import { BindingRegistry } from './binding-registry';
import { Callsite } from '../utils/our-callsite';
import { StepBinding, StepBindingFlags } from '../types/step-binding';

/**
 * A method decorator that marks the associated function as a 'Before Scenario' step. The function is
 * executed before each scenario.
 *
 * @param tag An optional tag.
 */
export function before(tag?: string, timeout?: number): MethodDecorator {
	const callSite = Callsite.capture();
	return createDecoratorFactory(StepBindingFlags.before, callSite, tag, timeout);
}
/**
 * A method decorator that marks the associated function as a 'Before All Scenario' step. The function is
 * executed before all scenarios are executed.
 *
 * @param tag An optional tag.
 */
export function beforeAll(tag?: string, timeout?: number): MethodDecorator {
	const callSite = Callsite.capture();
	return createDecoratorFactory(StepBindingFlags.beforeAll, callSite, tag, timeout);
}

/**
 * A method decorator that marks the associated function as an 'After Scenario' step. The function is
 * executed after each scenario.
 *
 * @param tag An optional tag.
 */
export function after(tag?: string, timeout?: number): MethodDecorator {
	const callSite = Callsite.capture();
	return createDecoratorFactory(StepBindingFlags.after, callSite, tag, timeout);
}
/**
 * A method decorator that marks the associated function as an 'After All Scenario' step. The function is
 * executed after all scenarios are executed.
 *
 * @param tag An optional tag.
 */
export function afterAll(tag?: string, timeout?: number): MethodDecorator {
	const callSite = Callsite.capture();
	return createDecoratorFactory(StepBindingFlags.afterAll, callSite, tag, timeout);
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
			callsite: callSite
		};

		if (tag) {
			stepBinding.tag = checkTag(tag);
		}

		BindingRegistry.instance.registerStepBinding(stepBinding);

		return descriptor;
	};
}
