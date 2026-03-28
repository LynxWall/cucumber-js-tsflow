"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStepBindings = exports.addStepBinding = exports.getStepBindingsExp = exports.addStepBindingExp = exports.getCollectedBindings = exports.collectStepBinding = void 0;
/**
 * Storage for experimental decorators (legacy TypeScript decorators).
 * Used when global.experimentalDecorators = true.
 * These decorators don't have access to context.metadata, so we use a module-level array.
 */
let stepBindings = null;
/**
 * Storage for standard decorators (TC39 Stage 3 decorators).
 * Used when global.experimentalDecorators = false.
 * Standard decorators can't always access context.metadata during initialization,
 * so we need this fallback storage for the addInitializer phase.
 */
let collectedBindings = [];
/**
 * Add a StepBinding to the collection (for standard decorators)
 * Used by method decorators to store bindings that will be processed
 * when the class decorator's initializer runs.
 */
const collectStepBinding = (binding) => {
    collectedBindings.push(binding);
};
exports.collectStepBinding = collectStepBinding;
/**
 * Get all collected bindings and reset the collection
 * Called by the @binding class decorator's initializer to process
 * all method decorators that were applied to the class.
 */
const getCollectedBindings = () => {
    const bindings = [...collectedBindings];
    collectedBindings = [];
    return bindings;
};
exports.getCollectedBindings = getCollectedBindings;
/**
 * Add a StepBinding to a local array for Experimental Decorators
 * Used when global.experimentalDecorators = true
 *
 * @param binding StepBinding to add
 */
const addStepBindingExp = (binding) => {
    if (!stepBindings)
        stepBindings = new Array();
    stepBindings.push(binding);
};
exports.addStepBindingExp = addStepBindingExp;
/**
 * Get all step bindings in the local array and then reset
 * to an empty array if reset = true (default)
 * Used when global.experimentalDecorators = true
 *
 * @param context Current DecoratorContext
 * @param reset Reset metadata on the context. Default=true
 * @returns Array of StepBindings
 */
const getStepBindingsExp = (reset = true) => {
    let bindings = [];
    if (stepBindings && stepBindings.length > 0) {
        bindings = [...stepBindings];
        if (reset) {
            stepBindings = new Array();
        }
    }
    return bindings;
};
exports.getStepBindingsExp = getStepBindingsExp;
/**
 * Add a StepBinding to the DecoratorContext metadata
 * Used during the decoration phase of standard decorators.
 * Note: This is separate from collectedBindings which is used during initialization.
 * Returns true if successful, false if context not ready
 */
const addStepBinding = (context, binding) => {
    if (!context.metadata.stepBindings) {
        // Check if we can initialize it
        if (context.metadata && typeof context.metadata === 'object') {
            context.metadata.stepBindings = new Array();
        }
        else {
            // Context not ready
            return false;
        }
    }
    context.metadata.stepBindings.push(binding);
    return true;
};
exports.addStepBinding = addStepBinding;
/**
 * Get all step bindings in DecoratorContext metadata and then reset
 * stepBindings in the metadata to an empty array if reset = true (default)
 * Used during the decoration phase of standard decorators.
 *
 * @param context Current DecoratorContext
 * @param reset Reset metadata on the context. Default=true
 * @returns Array of StepBindings
 */
const getStepBindings = (context, reset = true) => {
    let bindings = [];
    const stepBindings = context.metadata.stepBindings;
    if (stepBindings && stepBindings.length > 0) {
        bindings = [...stepBindings];
        if (reset) {
            context.metadata.stepBindings = new Array();
        }
    }
    return bindings;
};
exports.getStepBindings = getStepBindings;
//# sourceMappingURL=binding-context.js.map