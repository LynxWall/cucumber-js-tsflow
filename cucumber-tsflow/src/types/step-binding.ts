import { Callsite } from '../utils/our-callsite';
import { StepBindingFlags } from './step-binding-flags';

/**
 * Encapsulates data about a step binding.
 */
export interface StepBinding {
	/**
	 * The callsite of the step binding.
	 */
	callsite: Callsite;

	/**
	 * The typescript 'binding' class that is associated with the current step.
	 */
	classPrototype: any;

	/**
	 * The function name that is associated with the current step.
	 */
	classPropertyKey: string | symbol;

	/**
	 * Key passed in with options in cucumber step bindings.
	 * This property is used to match tsflow step definitions
	 * with cucumber step definitions.
	 */
	cucumberKey: string;

	/**
	 * The step binding type.
	 */
	bindingType: StepBindingFlags;

	/**
	 * The step pattern.
	 */
	stepPattern: RegExp | string;

	/**
	 * Function for this step that's passed in from the decorator.
	 */
	stepFunction: Function | undefined;

	/**
	 * Flag to indicate if the target is static or not.
	 * If true than we don't 'apply' to the class instance.
	 */
	stepIsStatic: boolean;

	/**
	 * The number of arguments for the step, which is captured in
	 * the decorator using arguments.length.
	 */
	stepArgsLength: number;

	/**
	 * The optional tag(s) that are associated with the current step.
	 */
	tags?: string;

	/**
	 * The optiomal timeout that is associated with the current step.
	 */
	timeout?: number;

	/**
	 * The wrapper Option passing to cucumber
	 */
	wrapperOption?: any;
}

export * from './step-binding-flags';
