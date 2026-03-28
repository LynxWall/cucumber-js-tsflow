"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BindingRegistry = exports.DEFAULT_TAG = exports.DEFAULT_STEP_PATTERN = void 0;
const underscore_1 = __importDefault(require("underscore"));
const step_binding_1 = require("./step-binding");
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Represents the default step pattern.
 */
exports.DEFAULT_STEP_PATTERN = '/.*/';
/**
 * Represents the default tag.
 */
exports.DEFAULT_TAG = '*';
/**
 * A metadata registry that captures information about bindings and their bound step bindings.
 */
class BindingRegistry {
    _stepBindings = new Map();
    _classBindings = new Map();
    /**
     * Gets the binding registry singleton.
     *
     * @returns A [[BindingRegistry]].
     */
    static get instance() {
        const BINDING_REGISTRY_SLOTNAME = '__CUCUMBER_TSFLOW_BINDINGREGISTRY';
        const registry = global[BINDING_REGISTRY_SLOTNAME];
        if (!registry) {
            global[BINDING_REGISTRY_SLOTNAME] = new BindingRegistry();
        }
        return registry || global[BINDING_REGISTRY_SLOTNAME];
    }
    /**
     * Updates the binding registry with information about the context types required by a
     * binding class.
     *
     * @param classPrototype The class representing the binding (constructor function).
     * @param contextTypes An array of [[ContextType]] that define the types of objects that
     * should be injected into the binding class during a scenario execution.
     */
    registerContextTypesForClass(classPrototype, contextTypes) {
        if (!contextTypes) {
            return;
        }
        let targetDecorations = this._classBindings.get(classPrototype);
        if (!targetDecorations) {
            targetDecorations = {
                stepBindings: [],
                contextTypes: []
            };
            this._classBindings.set(classPrototype, targetDecorations);
        }
        targetDecorations.contextTypes = contextTypes;
    }
    /**
     * Retrieves the context types that have been registered for a given binding class.
     *
     * @param classPrototype The class representing the binding (constructor function).
     *
     * @returns An array of [[ContextType]] that have been registered for the specified
     * binding class.
     */
    getContextTypesForClass(classPrototype) {
        const targetBinding = this._classBindings.get(classPrototype);
        if (!targetBinding) {
            return [];
        }
        return targetBinding.contextTypes;
    }
    /**
     * Updates the binding registry indexes with a step binding.
     *
     * @param stepBinding The step binding that is to be registered with the binding registry.
     */
    registerStepBinding(stepBinding) {
        if (!stepBinding.tags) {
            stepBinding.tags = exports.DEFAULT_TAG;
        }
        if (stepBinding.tags !== exports.DEFAULT_TAG && !stepBinding.tags.startsWith('@')) {
            // tslint:disable-next-line:no-console
            logger_1.default.debug('tag should start with @; tsflow has stopped to automatically prepend @ for you.');
        }
        const stepPattern = stepBinding.stepPattern
            ? stepBinding.stepPattern.toString()
            : exports.DEFAULT_STEP_PATTERN;
        let tagMap = this._stepBindings.get(stepPattern);
        if (!tagMap) {
            tagMap = new Map();
            this._stepBindings.set(stepPattern, tagMap);
        }
        let stepBindings = tagMap.get(stepBinding.tags);
        if (!stepBindings) {
            stepBindings = [];
            tagMap.set(stepBinding.tags, stepBindings);
        }
        if (!stepBindings.some(b => isSameStepBinding(stepBinding, b))) {
            stepBindings.push(stepBinding);
        }
        // Index the step binding for the target
        let targetBinding = this._classBindings.get(stepBinding.classPrototype);
        if (!targetBinding) {
            targetBinding = {
                stepBindings: [],
                contextTypes: []
            };
            this._classBindings.set(stepBinding.classPrototype, targetBinding);
        }
        if (!targetBinding.stepBindings.some(b => isSameStepBinding(stepBinding, b))) {
            targetBinding.stepBindings.push(stepBinding);
        }
        function isSameStepBinding(a, b) {
            // For hooks, we need to check the binding type and method name too
            if (a.bindingType & step_binding_1.StepBindingFlags.Hooks) {
                return (a.callsite.filename === b.callsite.filename &&
                    a.callsite.lineNumber === b.callsite.lineNumber &&
                    String(a.tags) === String(b.tags) &&
                    String(a.stepPattern) === String(b.stepPattern) &&
                    a.bindingType === b.bindingType &&
                    a.classPropertyKey === b.classPropertyKey);
            }
            // For step definitions, the existing check is fine
            return (a.callsite.filename === b.callsite.filename &&
                a.callsite.lineNumber === b.callsite.lineNumber &&
                String(a.tags) === String(b.tags) &&
                String(a.stepPattern) === String(b.stepPattern));
        }
    }
    /**
     * Retrieves the step bindings that have been registered for a given binding class.
     *
     * @param targetPrototype The class representing the binding (constructor function).
     *
     * @returns An array of [[StepBinding]] objects that have been registered for the specified
     * binding class.
     */
    getStepBindingsForTarget(targetPrototype) {
        const targetBinding = this._classBindings.get(targetPrototype);
        if (!targetBinding) {
            return [];
        }
        return targetBinding.stepBindings;
    }
    /**
     * Retrieves the step bindings for a given step pattern and collection of tag names.
     *
     * @param stepPattern The step pattern to search.
     * @param tags An array of [[TagName]] to search.
     *
     * @returns An array of [[StepBinding]] that map to the given step pattern and set of tag names.
     */
    getStepBindings(stepPattern, tags) {
        const tagMap = this._stepBindings.get(stepPattern);
        if (!tagMap) {
            return [];
        }
        const matchingStepBindings = this.mapTagNamesToStepBindings(tags, tagMap);
        if (matchingStepBindings.length > 0) {
            return matchingStepBindings;
        }
        return this.mapTagNamesToStepBindings(['*'], tagMap);
    }
    getStepBindingByCucumberKey(cucumberKey) {
        let result = undefined;
        for (const [_, binding] of this._classBindings) {
            for (const stepBinding of binding.stepBindings) {
                if (stepBinding.cucumberKey === cucumberKey) {
                    result = stepBinding;
                    break;
                }
            }
            if (result) {
                break;
            }
        }
        return result;
    }
    /**
     * Updates the SupportCodeLibrary from Cucumber with
     * callsite information from tsflow bindings
     * @param library
     * @returns
     */
    updateSupportCodeLibrary = (library) => {
        this._classBindings.forEach(binding => {
            binding.stepBindings.forEach(stepBinding => {
                let cucumberDefinition = undefined;
                switch (stepBinding.bindingType) {
                    case step_binding_1.StepBindingFlags.beforeAll:
                        cucumberDefinition = library.beforeTestRunHookDefinitions.find(s => s.options.cucumberKey === stepBinding.cucumberKey);
                        break;
                    case step_binding_1.StepBindingFlags.before:
                        cucumberDefinition = library.beforeTestCaseHookDefinitions.find(s => s.options.cucumberKey === stepBinding.cucumberKey);
                        break;
                    case step_binding_1.StepBindingFlags.beforeStep:
                        cucumberDefinition = library.beforeTestStepHookDefinitions.find(s => s.options.cucumberKey === stepBinding.cucumberKey);
                        break;
                    case step_binding_1.StepBindingFlags.given:
                        cucumberDefinition = library.stepDefinitions.find(s => s.options.cucumberKey === stepBinding.cucumberKey);
                        break;
                    case step_binding_1.StepBindingFlags.when:
                        cucumberDefinition = library.stepDefinitions.find(s => s.options.cucumberKey === stepBinding.cucumberKey);
                        break;
                    case step_binding_1.StepBindingFlags.then:
                        cucumberDefinition = library.stepDefinitions.find(s => s.options.cucumberKey === stepBinding.cucumberKey);
                        break;
                    case step_binding_1.StepBindingFlags.afterStep:
                        cucumberDefinition = library.afterTestStepHookDefinitions.find(s => s.options.cucumberKey === stepBinding.cucumberKey);
                        break;
                    case step_binding_1.StepBindingFlags.after:
                        cucumberDefinition = library.afterTestCaseHookDefinitions.find(s => s.options.cucumberKey === stepBinding.cucumberKey);
                        break;
                    case step_binding_1.StepBindingFlags.afterAll:
                        cucumberDefinition = library.afterTestRunHookDefinitions.find(s => s.options.cucumberKey === stepBinding.cucumberKey);
                        break;
                }
                if (cucumberDefinition) {
                    cucumberDefinition.line = stepBinding.callsite.lineNumber;
                    cucumberDefinition.uri = stepBinding.callsite.filename;
                }
            });
        });
        return library;
    };
    /**
     * Export all registered step bindings as structured-clone-safe descriptors.
     * Used by loader-workers to send binding metadata back to the main thread.
     *
     * @returns An array of [[SerializableBindingDescriptor]].
     */
    toDescriptors() {
        const descriptors = [];
        for (const [, binding] of this._classBindings) {
            for (const stepBinding of binding.stepBindings) {
                descriptors.push((0, step_binding_1.serializeBinding)(stepBinding));
            }
        }
        return descriptors;
    }
    /**
     * Remove all step bindings that originated from a given source file.
     * This supports delta-aware reload — bindings from changed files are purged
     * before re-loading so stale entries don't accumulate.
     *
     * @param filename Absolute path to the source file whose bindings should be removed.
     */
    removeBindingsForFile(filename) {
        // Remove from _stepBindings index
        for (const [pattern, tagMap] of this._stepBindings) {
            for (const [tag, bindings] of tagMap) {
                const filtered = bindings.filter(b => b.callsite.filename !== filename);
                if (filtered.length === 0) {
                    tagMap.delete(tag);
                }
                else {
                    tagMap.set(tag, filtered);
                }
            }
            if (tagMap.size === 0) {
                this._stepBindings.delete(pattern);
            }
        }
        // Remove from _classBindings index
        for (const [proto, classBinding] of this._classBindings) {
            classBinding.stepBindings = classBinding.stepBindings.filter(b => b.callsite.filename !== filename);
            if (classBinding.stepBindings.length === 0 && classBinding.contextTypes.length === 0) {
                this._classBindings.delete(proto);
            }
        }
    }
    /**
     * Check whether a binding with the given cucumberKey is already registered.
     *
     * @param cucumberKey The unique key to check.
     * @returns true if a binding with that key exists.
     */
    hasBindingForKey(cucumberKey) {
        for (const [, binding] of this._classBindings) {
            if (binding.stepBindings.some(b => b.cucumberKey === cucumberKey)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Collect the unique set of source filenames from all registered bindings.
     * Useful for comparing what was loaded in a worker versus what exists on the main thread.
     *
     * @returns A Set of absolute file paths.
     */
    getDescriptorSourceFiles() {
        const files = new Set();
        for (const [, binding] of this._classBindings) {
            for (const stepBinding of binding.stepBindings) {
                files.add(stepBinding.callsite.filename);
            }
        }
        return files;
    }
    /**
     * Maps an array of tag names to an array of associated step bindings.
     *
     * @param tags An array of [[TagName]].
     * @param tagMap The map of [[TagName]] -> [[StepBinding]] to use when mapping.
     *
     * @returns An array of [[StepBinding]].
     */
    mapTagNamesToStepBindings(tags, tagMap) {
        const matchingStepBindings = underscore_1.default.flatten(underscore_1.default.map(tags, tag => tagMap.get(tag)));
        return underscore_1.default.reject(matchingStepBindings, stepBinding => stepBinding === undefined);
    }
}
exports.BindingRegistry = BindingRegistry;
//# sourceMappingURL=binding-registry.js.map