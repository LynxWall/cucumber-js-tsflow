import { Callsite } from '../utils/our-callsite';
import { StepBinding, StepBindingFlags } from './step-binding';
import shortUuid from 'short-uuid';
import { addStepBinding, addStepBindingExp } from './binding-context';

/**
 * A method decorator that marks the associated function as a 'Given' step.
 *
 * @param stepPattern The regular expression that will be used to match steps.
 * @param tag An optional tag.
 * @param timeout An optional timeout.
 */
export function given(stepPattern: RegExp | string, tag?: string, timeout?: number, wrapperOption?: any): any {
	const callsite = Callsite.capture();
	if (global.experimentalDecorators) {
		return <T>(target: any, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => {
			const stepBinding: StepBinding = {
				stepPattern: stepPattern,
				bindingType: StepBindingFlags.given,
				classPrototype: target,
				classPropertyKey: propertyKey,
				stepFunction: target[propertyKey],
				stepIsStatic: false,
				stepArgsLength: target[propertyKey].length,
				tags: tag,
				timeout: timeout,
				wrapperOption: wrapperOption,
				callsite: callsite,
				cucumberKey: shortUuid().new()
			};
			addStepBindingExp(stepBinding);

			return descriptor;
		};
	} else {
		return function givenDecorator(target: Function, context: ClassMethodDecoratorContext) {
			const stepBinding: StepBinding = {
				stepPattern: stepPattern,
				bindingType: StepBindingFlags.given,
				classPrototype: undefined,
				classPropertyKey: context.name,
				stepFunction: target,
				stepIsStatic: context.static,
				stepArgsLength: target.length,
				tags: tag,
				timeout: timeout,
				wrapperOption: wrapperOption,
				callsite: callsite,
				cucumberKey: shortUuid().new()
			};
			addStepBinding(context, stepBinding);

			return;
		};
	}
}

/**
 * A method decorator that marks the associated function as a 'When' step.
 *
 * @param stepPattern The regular expression that will be used to match steps.
 * @param tag An optional tag.
 * @param timeout An optional timeout.
 */
export function when(stepPattern: RegExp | string, tag?: string, timeout?: number, wrapperOption?: any): any {
	const callsite = Callsite.capture();

	if (global.experimentalDecorators) {
		return <T>(target: any, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => {
			const stepBinding: StepBinding = {
				stepPattern: stepPattern,
				bindingType: StepBindingFlags.when,
				classPrototype: target,
				classPropertyKey: propertyKey,
				stepFunction: target[propertyKey],
				stepIsStatic: false,
				stepArgsLength: target[propertyKey].length,
				tags: tag,
				timeout: timeout,
				wrapperOption: wrapperOption,
				callsite: callsite,
				cucumberKey: shortUuid().new()
			};
			addStepBindingExp(stepBinding);

			return descriptor;
		};
	} else {
		return function whenDecorator(target: Function, context: ClassMethodDecoratorContext) {
			const stepBinding: StepBinding = {
				stepPattern: stepPattern,
				bindingType: StepBindingFlags.when,
				classPrototype: undefined,
				classPropertyKey: context.name,
				stepFunction: target,
				stepIsStatic: context.static,
				stepArgsLength: target.length,
				tags: tag,
				timeout: timeout,
				wrapperOption: wrapperOption,
				callsite: callsite,
				cucumberKey: shortUuid().new()
			};
			addStepBinding(context, stepBinding);

			return;
		};
	}
}

/**
 * A method decorator that marks the associated function as a 'Then' step.
 *
 * @param stepPattern The regular expression that will be used to match steps.
 * @param tag An optional tag.
 * @param timeout An optional timeout.
 */
export function then(stepPattern: RegExp | string, tag?: string, timeout?: number, wrapperOption?: any): any {
	const callsite = Callsite.capture();

	if (global.experimentalDecorators) {
		return <T>(target: any, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<T>) => {
			const stepBinding: StepBinding = {
				stepPattern: stepPattern,
				bindingType: StepBindingFlags.then,
				classPrototype: target,
				classPropertyKey: propertyKey,
				stepFunction: target[propertyKey],
				stepIsStatic: false,
				stepArgsLength: target[propertyKey].length,
				tags: tag,
				timeout: timeout,
				wrapperOption: wrapperOption,
				callsite: callsite,
				cucumberKey: shortUuid().new()
			};
			addStepBindingExp(stepBinding);

			return descriptor;
		};
	} else {
		return function thenDecorator(target: Function, context: ClassMethodDecoratorContext) {
			const stepBinding: StepBinding = {
				stepPattern: stepPattern,
				bindingType: StepBindingFlags.then,
				classPrototype: undefined,
				classPropertyKey: context.name,
				stepFunction: target,
				stepIsStatic: context.static,
				stepArgsLength: target.length,
				tags: tag,
				timeout: timeout,
				wrapperOption: wrapperOption,
				callsite: callsite,
				cucumberKey: shortUuid().new()
			};
			addStepBinding(context, stepBinding);

			return;
		};
	}
}
