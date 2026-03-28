"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.binding = binding;
const cucumber_1 = require("@cucumber/cucumber");
const binding_context_1 = require("./binding-context");
const binding_registry_1 = require("./binding-registry");
const step_binding_1 = require("./step-binding");
/**
 * A set of step patterns that have been registered with Cucumber.
 *
 * In order to support scoped (or tagged) step definitions, we must ensure that any step binding is
 * only registered with Cucumber once. The binding function for that step pattern then becomes
 * responsible for looking up and execuing the step binding based on the context that is in scope at
 * the point of invocation.
 */
const stepPatternRegistrations = new Map();
/**
 * A class decorator that marks the associated class as a CucumberJS binding.
 *
 * @param requiredContextTypes An optional array of Types that will be created and passed into the created
 * object for each scenario.
 *
 * An instance of the decorated class will be created for each scenario.
 */
function binding(requiredContextTypes) {
    if (global.experimentalDecorators) {
        return (target) => {
            const bindingRegistry = binding_registry_1.BindingRegistry.instance;
            bindingRegistry.registerContextTypesForClass(target.prototype, requiredContextTypes);
            // the class decorator is called last when decorators on a type are initialized. All other decorators
            // are added to DecoratorContext.metadata before this is called.
            // This will get all those bindings and then clear metadata for the next type that's loaded.
            const allBindings = (0, binding_context_1.getStepBindingsExp)();
            allBindings.forEach(stepBinding => {
                // For static methods, we need to set the classPrototype to the class itself, not the prototype
                if (stepBinding.stepIsStatic) {
                    stepBinding.classPrototype = target;
                }
                else {
                    stepBinding.classPrototype = target.prototype;
                }
                bindingRegistry.registerStepBinding(stepBinding);
                // Register with cucumber
                addStepBinding(stepBinding);
            });
        };
    }
    else {
        return function classDecorator(target, context) {
            const bindingRegistry = binding_registry_1.BindingRegistry.instance;
            bindingRegistry.registerContextTypesForClass(target.prototype, requiredContextTypes);
            // the class decorator is called last when decorators on a type are initialized. All other decorators
            // are added to DecoratorContext.metadata before this is called.
            // This will get all those bindings and then clear metadata for the next type that's loaded.
            const allBindings = (0, binding_context_1.getStepBindings)(context);
            allBindings.forEach(stepBinding => {
                // Set the class prototype and then register the binding with the prototype
                stepBinding.classPrototype = target.prototype;
                bindingRegistry.registerStepBinding(stepBinding);
                // add the step binding to the binding registry
                addStepBinding(stepBinding);
            });
            // Process pending step bindings after class is decorated
            context.addInitializer(function () {
                // Get all the collected bindings
                const allBindings = (0, binding_context_1.getCollectedBindings)();
                allBindings.forEach(stepBinding => {
                    // Set the class prototype and register
                    stepBinding.classPrototype = target.prototype;
                    bindingRegistry.registerStepBinding(stepBinding);
                    // Register with cucumber - call the local addStepBinding function
                    addStepBinding(stepBinding);
                });
            });
            return target;
        };
    }
}
/**
 * Common helper used to add StepBindings to the binding registry
 * @param stepBinding
 * @returns
 */
function addStepBinding(stepBinding) {
    // In loader-worker threads, skip Cucumber registration — we only need
    // the BindingRegistry populated for descriptor extraction.
    if (global.__LOADER_WORKER) {
        return;
    }
    if (stepBinding.bindingType & step_binding_1.StepBindingFlags.StepDefinitions) {
        let stepBindingFlags = stepPatternRegistrations.get(stepBinding.stepPattern.toString());
        if (stepBindingFlags === undefined) {
            stepBindingFlags = step_binding_1.StepBindingFlags.none;
        }
        if (stepBindingFlags & stepBinding.bindingType) {
            return;
        }
        bindStepDefinition(stepBinding);
        stepPatternRegistrations.set(stepBinding.stepPattern.toString(), stepBindingFlags | stepBinding.bindingType);
    }
    else if (stepBinding.bindingType & step_binding_1.StepBindingFlags.Hooks) {
        bindHook(stepBinding);
    }
}
/**
 * Binds a step definition to Cucumber.
 *
 * @param stepBinding The [[StepBinding]] that represents a 'given', 'when', or 'then' step definition.
 */
function bindStepDefinition(stepBinding) {
    const stepFunction = function () {
        const bindingRegistry = binding_registry_1.BindingRegistry.instance;
        const scenarioContext = global.messageCollector.getStepScenarioContext(stepBinding);
        if (scenarioContext) {
            const matchingStepBindings = bindingRegistry.getStepBindings(stepBinding.stepPattern.toString(), scenarioContext.scenarioInfo.tags);
            if (matchingStepBindings.length > 1) {
                let message = `Ambiguous step definitions for '${matchingStepBindings[0].stepPattern}':\n`;
                matchingStepBindings.forEach(matchingStepBinding => {
                    message =
                        message +
                            `\t\t${String(matchingStepBinding.classPropertyKey)} (${matchingStepBinding.callsite.toString()})\n`;
                });
                throw new Error(message);
            }
            else if (matchingStepBindings.length === 0) {
                throw new Error(`Cannot find matched step definition for ${stepBinding.stepPattern.toString()} with tag ${scenarioContext.scenarioInfo.tags} in binding registry`);
            }
            const contextTypes = bindingRegistry.getContextTypesForClass(matchingStepBindings[0].classPrototype);
            const bindingObject = scenarioContext.getOrActivateBindingClass(matchingStepBindings[0].classPrototype, contextTypes, this);
            bindingObject._worldObj = this;
            return bindingObject[matchingStepBindings[0].classPropertyKey].apply(bindingObject, arguments);
        }
        else {
            throw new Error('Unable to find the Scenario Context for a Step!');
        }
    };
    Object.defineProperty(stepFunction, 'length', {
        value: stepBinding.stepArgsLength
    });
    // initialize options used on all step bindings
    const options = {
        cucumberKey: stepBinding.cucumberKey,
        timeout: stepBinding.timeout,
        wrapperOptions: stepBinding.wrapperOption
    };
    // call appropriate step
    if (stepBinding.bindingType & step_binding_1.StepBindingFlags.given) {
        (0, cucumber_1.Given)(stepBinding.stepPattern, options, stepFunction);
    }
    else if (stepBinding.bindingType & step_binding_1.StepBindingFlags.when) {
        (0, cucumber_1.When)(stepBinding.stepPattern, options, stepFunction);
    }
    else if (stepBinding.bindingType & step_binding_1.StepBindingFlags.then) {
        (0, cucumber_1.Then)(stepBinding.stepPattern, options, stepFunction);
    }
}
/**
 * Binds a hook to Cucumber.
 *
 * @param stepBinding The [[StepBinding]] that represents a 'before', or 'after', step definition.
 */
function bindHook(stepBinding) {
    const globalHookFunction = function () {
        // Check if it's a static method
        if (stepBinding.stepIsStatic || !stepBinding.classPrototype[stepBinding.classPropertyKey]) {
            const constructor = stepBinding.classPrototype.constructor;
            if (constructor && constructor[stepBinding.classPropertyKey]) {
                return constructor[stepBinding.classPropertyKey].apply(constructor);
            }
        }
        // For non-static methods
        if (stepBinding.classPrototype[stepBinding.classPropertyKey]) {
            return stepBinding.classPrototype[stepBinding.classPropertyKey].apply(stepBinding.classPrototype);
        }
        throw new Error(`Method ${String(stepBinding.classPropertyKey)} not found on class ${stepBinding.classPrototype?.constructor?.name}`);
    };
    // Main binding for all other hooks (before, after, beforeStep, afterStep)
    const hookFunction = function (arg) {
        const scenarioContext = global.messageCollector.getHookScenarioContext(arg);
        if (scenarioContext) {
            const contextTypes = binding_registry_1.BindingRegistry.instance.getContextTypesForClass(stepBinding.classPrototype);
            const bindingObject = scenarioContext.getOrActivateBindingClass(stepBinding.classPrototype, contextTypes, this);
            bindingObject._worldObj = this;
            return bindingObject[stepBinding.classPropertyKey].apply(bindingObject, arguments);
        }
        else {
            throw new Error('Unable to find the Scenario Context for Hook!');
        }
    };
    // length values need to be added to our binding functions.
    // These are used in cucumber to determine if the function is
    // a callback or promise.
    Object.defineProperty(globalHookFunction, 'length', {
        value: stepBinding.stepArgsLength
    });
    Object.defineProperty(hookFunction, 'length', {
        value: stepBinding.stepArgsLength
    });
    const tags = stepBinding.tags === binding_registry_1.DEFAULT_TAG ? undefined : stepBinding.tags;
    // This binds the appropriate function above to the associated
    // cucumber step functions.
    switch (stepBinding.bindingType) {
        case step_binding_1.StepBindingFlags.beforeAll: {
            const options = { cucumberKey: stepBinding.cucumberKey, timeout: stepBinding.timeout };
            (0, cucumber_1.BeforeAll)(options, globalHookFunction);
            break;
        }
        case step_binding_1.StepBindingFlags.before: {
            const options = { cucumberKey: stepBinding.cucumberKey, tags: tags, timeout: stepBinding.timeout };
            (0, cucumber_1.Before)(options, hookFunction);
            break;
        }
        case step_binding_1.StepBindingFlags.beforeStep: {
            const options = { cucumberKey: stepBinding.cucumberKey, tags: tags, timeout: stepBinding.timeout };
            (0, cucumber_1.BeforeStep)(options, hookFunction);
            break;
        }
        case step_binding_1.StepBindingFlags.afterAll: {
            const options = { cucumberKey: stepBinding.cucumberKey, timeout: stepBinding.timeout };
            (0, cucumber_1.AfterAll)(options, globalHookFunction);
            break;
        }
        case step_binding_1.StepBindingFlags.after: {
            const options = { cucumberKey: stepBinding.cucumberKey, tags: tags, timeout: stepBinding.timeout };
            (0, cucumber_1.After)(options, hookFunction);
            break;
        }
        case step_binding_1.StepBindingFlags.afterStep: {
            const options = { cucumberKey: stepBinding.cucumberKey, tags: tags, timeout: stepBinding.timeout };
            (0, cucumber_1.AfterStep)(options, hookFunction);
            break;
        }
    }
}
//# sourceMappingURL=binding-decorator.js.map