"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StepBindingFlags = void 0;
exports.serializeBinding = serializeBinding;
/**
 * Convert a live StepBinding to a structured-clone-safe descriptor.
 * This strips classPrototype and stepFunction, serializes RegExp patterns,
 * and converts symbol keys to strings.
 */
function serializeBinding(binding) {
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
var types_1 = require("./types");
Object.defineProperty(exports, "StepBindingFlags", { enumerable: true, get: function () { return types_1.StepBindingFlags; } });
//# sourceMappingURL=step-binding.js.map