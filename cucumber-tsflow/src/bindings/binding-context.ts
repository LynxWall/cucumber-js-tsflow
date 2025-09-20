/**
 * Step Binding Storage Management
 *
 * This module manages three different storage mechanisms for StepBindings to support both experimental (legacy) and standard (TC39 Stage 3) decorators:
 *
 * 1. Experimental Decorators (global.experimentalDecorators = true):
 *    - Uses the 'stepBindings' array
 *    - Functions: addStepBindingExp(), getStepBindingsExp()
 *
 * 2. Standard Decorators - Decoration Phase:
 *    - Uses context.metadata.stepBindings
 *    - Functions: addStepBinding(), getStepBindings()
 *
 * 3. Standard Decorators - Initialization Phase:
 *    - Uses 'collectedBindings' array
 *    - Functions: collectStepBinding(), getCollectedBindings()
 *    - Needed because context.metadata can't be modified during initialization
 *
 * The @binding class decorator determines which storage mechanism to use based on
 * the global.experimentalDecorators flag.
 */
import { StepBinding } from './step-binding';

/**
 * Storage for experimental decorators (legacy TypeScript decorators).
 * Used when global.experimentalDecorators = true.
 * These decorators don't have access to context.metadata, so we use a module-level array.
 */
let stepBindings: Array<StepBinding> = null;
/**
 * Storage for standard decorators (TC39 Stage 3 decorators).
 * Used when global.experimentalDecorators = false.
 * Standard decorators can't always access context.metadata during initialization,
 * so we need this fallback storage for the addInitializer phase.
 */
let collectedBindings: StepBinding[] = [];

/**
 * Add a StepBinding to the collection (for standard decorators)
 * Used by method decorators to store bindings that will be processed
 * when the class decorator's initializer runs.
 */
export const collectStepBinding = (binding: StepBinding): void => {
	collectedBindings.push(binding);
};

/**
 * Get all collected bindings and reset the collection
 * Called by the @binding class decorator's initializer to process
 * all method decorators that were applied to the class.
 */
export const getCollectedBindings = (): StepBinding[] => {
	const bindings = [...collectedBindings];
	collectedBindings = [];
	return bindings;
};

/**
 * Add a StepBinding to a local array for Experimental Decorators
 * Used when global.experimentalDecorators = true
 *
 * @param binding StepBinding to add
 */
export const addStepBindingExp = (binding: StepBinding): void => {
	if (!stepBindings) stepBindings = new Array<StepBinding>();
	stepBindings.push(binding);
};

/**
 * Get all step bindings in the local array and then reset
 * to an empty array if reset = true (default)
 * Used when global.experimentalDecorators = true
 *
 * @param context Current DecoratorContext
 * @param reset Reset metadata on the context. Default=true
 * @returns Array of StepBindings
 */
export const getStepBindingsExp = (reset: boolean = true): StepBinding[] => {
	let bindings: StepBinding[] = [];
	if (stepBindings && stepBindings.length > 0) {
		bindings = [...stepBindings];
		if (reset) {
			stepBindings = new Array<StepBinding>();
		}
	}
	return bindings;
};

/**
 * Add a StepBinding to the DecoratorContext metadata
 * Used during the decoration phase of standard decorators.
 * Note: This is separate from collectedBindings which is used during initialization.
 * Returns true if successful, false if context not ready
 */
export const addStepBinding = (context: DecoratorContext, binding: StepBinding): boolean => {
	if (!context.metadata.stepBindings) {
		// Check if we can initialize it
		if (context.metadata && typeof context.metadata === 'object') {
			context.metadata.stepBindings = new Array<StepBinding>();
		} else {
			// Context not ready
			return false;
		}
	}
	(context.metadata.stepBindings as Array<StepBinding>).push(binding);
	return true;
};

/**
 * Get all step bindings in DecoratorContext metadata and then reset
 * stepBindings in the metadata to an empty array if reset = true (default)
 * Used during the decoration phase of standard decorators.
 *
 * @param context Current DecoratorContext
 * @param reset Reset metadata on the context. Default=true
 * @returns Array of StepBindings
 */
export const getStepBindings = (context: DecoratorContext, reset: boolean = true): StepBinding[] => {
	let bindings: StepBinding[] = [];
	const stepBindings = context.metadata.stepBindings as Array<StepBinding>;
	if (stepBindings && stepBindings.length > 0) {
		bindings = [...stepBindings];
		if (reset) {
			context.metadata.stepBindings = new Array<StepBinding>();
		}
	}
	return bindings;
};
