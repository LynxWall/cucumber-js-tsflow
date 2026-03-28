"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StepBindingFlags = void 0;
/**
 * The CucumberJS step binding types.
 */
var StepBindingFlags;
(function (StepBindingFlags) {
    /**
     * No bindings.
     */
    StepBindingFlags[StepBindingFlags["none"] = 0] = "none";
    /**
     * A 'Given' step definition binding.
     */
    StepBindingFlags[StepBindingFlags["given"] = 1] = "given";
    /**
     * A 'When' step definition binding.
     */
    StepBindingFlags[StepBindingFlags["when"] = 2] = "when";
    /**
     * A 'Then' step definition binding.
     */
    StepBindingFlags[StepBindingFlags["then"] = 4] = "then";
    /**
     * A 'Before' hook binding.
     */
    StepBindingFlags[StepBindingFlags["before"] = 8] = "before";
    /**
     * An 'After' hook binding.
     */
    StepBindingFlags[StepBindingFlags["after"] = 16] = "after";
    /**
     * An 'BeforeAll' hook binding
     */
    StepBindingFlags[StepBindingFlags["beforeAll"] = 32] = "beforeAll";
    /**
     * An 'AfterAll' hook binding
     */
    StepBindingFlags[StepBindingFlags["afterAll"] = 64] = "afterAll";
    /**
     * An 'BeforeStep' hook binding
     */
    StepBindingFlags[StepBindingFlags["beforeStep"] = 128] = "beforeStep";
    /**
     * An 'AfterStep' hook binding
     */
    StepBindingFlags[StepBindingFlags["afterStep"] = 256] = "afterStep";
    /**
     * All step definition bindings.
     */
    StepBindingFlags[StepBindingFlags["StepDefinitions"] = 7] = "StepDefinitions";
    /**
     * All hook bindings.
     */
    StepBindingFlags[StepBindingFlags["Hooks"] = 504] = "Hooks";
})(StepBindingFlags || (exports.StepBindingFlags = StepBindingFlags = {}));
//# sourceMappingURL=types.js.map