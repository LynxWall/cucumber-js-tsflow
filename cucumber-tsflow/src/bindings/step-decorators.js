"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.given = given;
exports.when = when;
exports.then = then;
const our_callsite_1 = require("../utils/our-callsite");
const step_binding_1 = require("./step-binding");
const short_uuid_1 = __importDefault(require("short-uuid"));
const binding_context_1 = require("./binding-context");
/**
 * A method decorator that marks the associated function as a 'Given' step.
 *
 * @param stepPattern The regular expression that will be used to match steps.
 * @param tag An optional tag.
 * @param timeout An optional timeout.
 */
function given(stepPattern, tag, timeout, wrapperOption) {
    const callsite = our_callsite_1.Callsite.capture();
    if (global.experimentalDecorators) {
        return (target, propertyKey, descriptor) => {
            const stepFunction = descriptor?.value || target[propertyKey];
            const stepBinding = {
                stepPattern: stepPattern,
                bindingType: step_binding_1.StepBindingFlags.given,
                classPrototype: target,
                classPropertyKey: propertyKey,
                stepFunction,
                stepIsStatic: false,
                stepArgsLength: stepFunction ? stepFunction.length : 0, // Safe access
                tags: tag,
                timeout: timeout,
                wrapperOption: wrapperOption,
                callsite: callsite,
                cucumberKey: (0, short_uuid_1.default)().new()
            };
            (0, binding_context_1.addStepBindingExp)(stepBinding);
            return descriptor;
        };
    }
    else {
        return function givenDecorator(target, context) {
            const stepBinding = {
                stepPattern: stepPattern,
                bindingType: step_binding_1.StepBindingFlags.given,
                classPrototype: undefined,
                classPropertyKey: context.name,
                stepFunction: target,
                stepIsStatic: context.static,
                stepArgsLength: target.length,
                tags: tag,
                timeout: timeout,
                wrapperOption: wrapperOption,
                callsite: callsite,
                cucumberKey: (0, short_uuid_1.default)().new()
            };
            (0, binding_context_1.collectStepBinding)(stepBinding);
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
function when(stepPattern, tag, timeout, wrapperOption) {
    const callsite = our_callsite_1.Callsite.capture();
    if (global.experimentalDecorators) {
        return (target, propertyKey, descriptor) => {
            const stepFunction = descriptor?.value || target[propertyKey];
            const stepBinding = {
                stepPattern: stepPattern,
                bindingType: step_binding_1.StepBindingFlags.when,
                classPrototype: target,
                classPropertyKey: propertyKey,
                stepFunction,
                stepIsStatic: false,
                stepArgsLength: stepFunction ? stepFunction.length : 0, // Safe access
                tags: tag,
                timeout: timeout,
                wrapperOption: wrapperOption,
                callsite: callsite,
                cucumberKey: (0, short_uuid_1.default)().new()
            };
            (0, binding_context_1.addStepBindingExp)(stepBinding);
            return descriptor;
        };
    }
    else {
        return function whenDecorator(target, context) {
            const stepBinding = {
                stepPattern: stepPattern,
                bindingType: step_binding_1.StepBindingFlags.when,
                classPrototype: undefined,
                classPropertyKey: context.name,
                stepFunction: target,
                stepIsStatic: context.static,
                stepArgsLength: target.length,
                tags: tag,
                timeout: timeout,
                wrapperOption: wrapperOption,
                callsite: callsite,
                cucumberKey: (0, short_uuid_1.default)().new()
            };
            (0, binding_context_1.collectStepBinding)(stepBinding);
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
function then(stepPattern, tag, timeout, wrapperOption) {
    const callsite = our_callsite_1.Callsite.capture();
    if (global.experimentalDecorators) {
        return (target, propertyKey, descriptor) => {
            const stepFunction = descriptor?.value || target[propertyKey];
            const stepBinding = {
                stepPattern: stepPattern,
                bindingType: step_binding_1.StepBindingFlags.then,
                classPrototype: target,
                classPropertyKey: propertyKey,
                stepFunction,
                stepIsStatic: false,
                stepArgsLength: stepFunction ? stepFunction.length : 0, // Safe access
                tags: tag,
                timeout: timeout,
                wrapperOption: wrapperOption,
                callsite: callsite,
                cucumberKey: (0, short_uuid_1.default)().new()
            };
            (0, binding_context_1.addStepBindingExp)(stepBinding);
            return descriptor;
        };
    }
    else {
        return function thenDecorator(target, context) {
            const stepBinding = {
                stepPattern: stepPattern,
                bindingType: step_binding_1.StepBindingFlags.then,
                classPrototype: undefined,
                classPropertyKey: context.name,
                stepFunction: target,
                stepIsStatic: context.static,
                stepArgsLength: target.length,
                tags: tag,
                timeout: timeout,
                wrapperOption: wrapperOption,
                callsite: callsite,
                cucumberKey: (0, short_uuid_1.default)().new()
            };
            (0, binding_context_1.collectStepBinding)(stepBinding);
            return;
        };
    }
}
//# sourceMappingURL=step-decorators.js.map