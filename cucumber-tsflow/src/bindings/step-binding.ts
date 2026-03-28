import { Callsite } from '../utils/our-callsite';
import { StepBindingFlags } from './types';

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

/**
 * A structured-clone-safe summary of a StepBinding.
 * Omits classPrototype (a live object reference) and stepFunction
 * (not needed at runtime — the binding decorator creates a replacement closure).
 * Used to transfer binding metadata from loader-worker threads to the main thread.
 */
export interface SerializableBindingDescriptor {
	/** Source file and line where the binding was declared */
	callsite: { filename: string; lineNumber: number };
	/** Property key on the class (always converted to string for serialization) */
	classPropertyKey: string;
	/** Unique key used to correlate with Cucumber definitions */
	cucumberKey: string;
	/** The step binding type flags */
	bindingType: StepBindingFlags;
	/** Step pattern serialized as a string (RegExp.toString() or literal) */
	stepPattern: string;
	/** Whether the target method is static */
	stepIsStatic: boolean;
	/** Number of arguments the step function expects */
	stepArgsLength: number;
	/** Optional tag expression */
	tags?: string;
	/** Optional timeout in ms */
	timeout?: number;
	/** Optional wrapper options (must be JSON-serializable) */
	wrapperOption?: any;
}

/**
 * Convert a live StepBinding to a structured-clone-safe descriptor.
 * This strips classPrototype and stepFunction, serializes RegExp patterns,
 * and converts symbol keys to strings.
 */
export function serializeBinding(binding: StepBinding): SerializableBindingDescriptor {
	return {
		callsite: {
			filename: binding.callsite.filename,
			lineNumber: binding.callsite.lineNumber
		},
		classPropertyKey: String(binding.classPropertyKey),
		cucumberKey: binding.cucumberKey,
		bindingType: binding.bindingType,
		stepPattern: binding.stepPattern ? binding.stepPattern.toString() : '',
		stepIsStatic: binding.stepIsStatic,
		stepArgsLength: binding.stepArgsLength,
		tags: binding.tags,
		timeout: binding.timeout,
		wrapperOption: binding.wrapperOption
	};
}

export { StepBindingFlags } from './types';
