import { BindingRegistry } from './binding-registry';
import { Callsite } from '../utils/our-callsite';
import { StepBinding, StepBindingFlags } from '../types/step-binding';
import shortUuid from 'short-uuid';

/**
 * A method decorator that marks the associated function as a 'Given' step.
 *
 * @param stepPattern The regular expression that will be used to match steps.
 * @param tag An optional tag.
 * @param timeout An optional timeout.
 */
export function given(
	stepPattern: RegExp | string,
	tag?: string,
	timeout?: number,
	wrapperOption?: any
): MethodDecorator {
	const callsite = Callsite.capture();

	return <T>(target: any, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => {
		const stepBinding: StepBinding = {
			stepPattern: stepPattern,
			bindingType: StepBindingFlags.given,
			targetPrototype: target,
			targetPropertyKey: propertyKey,
			argsLength: target[propertyKey].length,
			tags: tag,
			timeout: timeout,
			wrapperOption: wrapperOption,
			callsite: callsite,
			cucumberKey: shortUuid().new()
		};

		BindingRegistry.instance.registerStepBinding(stepBinding);

		return descriptor;
	};
}

/**
 * A method decorator that marks the associated function as a 'When' step.
 *
 * @param stepPattern The regular expression that will be used to match steps.
 * @param tag An optional tag.
 * @param timeout An optional timeout.
 */
export function when(
	stepPattern: RegExp | string,
	tag?: string,
	timeout?: number,
	wrapperOption?: any
): MethodDecorator {
	const callsite = Callsite.capture();

	return <T>(target: any, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => {
		const stepBinding: StepBinding = {
			stepPattern: stepPattern,
			bindingType: StepBindingFlags.when,
			targetPrototype: target,
			targetPropertyKey: propertyKey,
			argsLength: target[propertyKey].length,
			tags: tag,
			timeout: timeout,
			wrapperOption: wrapperOption,
			callsite: callsite,
			cucumberKey: shortUuid().new()
		};

		BindingRegistry.instance.registerStepBinding(stepBinding);

		return descriptor;
	};
}

/**
 * A method decorator that marks the associated function as a 'Then' step.
 *
 * @param stepPattern The regular expression that will be used to match steps.
 * @param tag An optional tag.
 * @param timeout An optional timeout.
 */
export function then(
	stepPattern: RegExp | string,
	tag?: string,
	timeout?: number,
	wrapperOption?: any
): MethodDecorator {
	const callsite = Callsite.capture();

	return <T>(target: any, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => {
		const stepBinding: StepBinding = {
			stepPattern: stepPattern,
			bindingType: StepBindingFlags.then,
			targetPrototype: target,
			targetPropertyKey: propertyKey,
			argsLength: target[propertyKey].length,
			tags: tag,
			timeout: timeout,
			wrapperOption: wrapperOption,
			callsite: callsite,
			cucumberKey: shortUuid().new()
		};

		BindingRegistry.instance.registerStepBinding(stepBinding);

		return descriptor;
	};
}
