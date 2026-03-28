"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.beforeAll = beforeAll;
exports.before = before;
exports.beforeStep = beforeStep;
exports.afterAll = afterAll;
exports.after = after;
exports.afterStep = afterStep;
const our_callsite_1 = require("../utils/our-callsite");
const step_binding_1 = require("./step-binding");
const short_uuid_1 = __importDefault(require("short-uuid"));
const binding_context_1 = require("./binding-context");
/**
 * A method decorator that marks the associated function as a 'Before All Scenario' step. The function is
 * executed before all scenarios are executed.
 *
 * @param timeout Optional timeout in milliseconds
 */
function beforeAll(timeout) {
    const callSite = our_callsite_1.Callsite.capture();
    return createDecoratorFactory(step_binding_1.StepBindingFlags.beforeAll, callSite, undefined, timeout);
}
/**
 * A method decorator that marks the associated function as a 'Before Scenario' step. The function is
 * executed before each scenario.
 *
 * @param tags Optional tag or tags associated with a scenario.
 * @param timeout Optional timeout in milliseconds
 */
function before(tags, timeout) {
    const callSite = our_callsite_1.Callsite.capture();
    return createDecoratorFactory(step_binding_1.StepBindingFlags.before, callSite, tags, timeout);
}
/**
 * A method decorator that marks the associated function as a 'Before Step' step. The function is
 * executed before each step.
 *
 * @param tags Optional tag or tags associated with a scenario.
 * @param timeout Optional timeout in milliseconds
 */
function beforeStep(tags, timeout) {
    const callSite = our_callsite_1.Callsite.capture();
    return createDecoratorFactory(step_binding_1.StepBindingFlags.beforeStep, callSite, tags, timeout);
}
/**
 * A method decorator that marks the associated function as an 'After All Scenario' step. The function is
 * executed after all scenarios are executed.
 *
 * @param timeout Optional timeout in milliseconds
 */
function afterAll(timeout) {
    const callSite = our_callsite_1.Callsite.capture();
    return createDecoratorFactory(step_binding_1.StepBindingFlags.afterAll, callSite, undefined, timeout);
}
/**
 * A method decorator that marks the associated function as an 'After Scenario' step. The function is
 * executed after each scenario.
 *
 * @param tags Optional tag or tags associated with a scenario.
 * @param timeout Optional timeout in milliseconds
 */
function after(tags, timeout) {
    const callSite = our_callsite_1.Callsite.capture();
    return createDecoratorFactory(step_binding_1.StepBindingFlags.after, callSite, tags, timeout);
}
/**
 * A method decorator that marks the associated function as a 'After Step' step. The function is
 * executed after each step.
 *
 * @param tags Optional tag or tags associated with a scenario.
 * @param timeout Optional timeout in milliseconds
 */
function afterStep(tags, timeout) {
    const callSite = our_callsite_1.Callsite.capture();
    return createDecoratorFactory(step_binding_1.StepBindingFlags.afterStep, callSite, tags, timeout);
}
function checkTag(tag) {
    return tag;
}
function createDecoratorFactory(flag, callSite, tag, timeout) {
    if (global.experimentalDecorators) {
        return (target, propertyKey, descriptor) => {
            const stepFunction = descriptor?.value || target[propertyKey];
            const stepBinding = {
                stepPattern: '',
                bindingType: flag,
                classPrototype: target,
                classPropertyKey: propertyKey,
                stepFunction,
                stepIsStatic: false,
                stepArgsLength: stepFunction ? stepFunction.length : 0, // Safe access
                tags: tag,
                timeout: timeout,
                callsite: callSite,
                cucumberKey: (0, short_uuid_1.default)().new()
            };
            if (tag) {
                stepBinding.tags = checkTag(tag);
            }
            (0, binding_context_1.addStepBindingExp)(stepBinding);
            return descriptor;
        };
    }
    else {
        return function hookDecorator(target, context) {
            const stepBinding = {
                stepPattern: '',
                bindingType: flag,
                classPrototype: undefined,
                classPropertyKey: context.name,
                stepFunction: target,
                stepIsStatic: context.static,
                stepArgsLength: target.length,
                tags: tag,
                timeout: timeout,
                callsite: callSite,
                cucumberKey: (0, short_uuid_1.default)().new()
            };
            if (tag) {
                stepBinding.tags = checkTag(tag);
            }
            (0, binding_context_1.collectStepBinding)(stepBinding);
            return;
        };
    }
}
//# sourceMappingURL=hook-decorators.js.map