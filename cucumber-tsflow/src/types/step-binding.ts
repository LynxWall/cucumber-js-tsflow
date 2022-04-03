import { Callsite } from '../utils/our-callsite';
import { StepBindingFlags } from './step-binding-flags';

/**
 * Encapsulates data about a step binding.
 */
export interface StepBinding {
	/**
	 * The step pattern.
	 */
	stepPattern: RegExp | string;

	/**
	 * The step binding type.
	 */
	bindingType: StepBindingFlags;

	/**
	 * The type that is associated with the current step binding.
	 */
	targetPrototype: any;

	/**
	 * The function name that is associated with the current step binding.
	 */
	targetPropertyKey: string | symbol;

	/**
	 * The count of arguments that have been specified on the [[StepBindingDescriptor.targetPropertyKey]].
	 */
	argsLength: number;

	/**
	 * The optional tag that is associated with the current step binding.
	 */
	tag?: string;

	/**
	 * The optiomal timeout that is associated with the current step binding.
	 */
	timeout?: number;

	/**
	 * The wrapper Option passing to cucumber
	 */
	wrapperOption?: any;

	/**
	 * The callsite of the step binding.
	 */
	callsite: Callsite;

	/**
	 * Key passed in with options in cucumber step bindings.
	 * This property is used to match tsflow step definitions
	 * with cucumber step definitions.
	 */
	cucumberKey: string;
}

export * from './step-binding-flags';
