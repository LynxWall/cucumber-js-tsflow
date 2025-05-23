import { StepBinding } from './step-binding';

let stepBindings: Array<StepBinding> = null;

/**
 * Add a StepBinding to a local array for Experimental Decorators
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
 *
 * @param context Current DecoratorContext
 * @param binding StepBinding to add
 */
export const addStepBinding = (context: DecoratorContext, binding: StepBinding): void => {
	if (!context.metadata.stepBindings) context.metadata.stepBindings = new Array<StepBinding>();
	(context.metadata.stepBindings as Array<StepBinding>).push(binding);
};

/**
 * Get all step bindings in DecoratorContext metadata and then reset
 * stepBindings in the metadata to an empty array if reset = true (default)
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
