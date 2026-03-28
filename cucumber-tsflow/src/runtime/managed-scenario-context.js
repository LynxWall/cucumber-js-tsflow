"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManagedScenarioContext = void 0;
const underscore_1 = __importDefault(require("underscore"));
const scenario_context_1 = require("./scenario-context");
class ActiveInfo {
    constructor(obj, isContext = false) {
        this.activeObject = obj;
        this.isContext = isContext;
    }
    activeObject;
    isContext;
    initialized = false;
}
/**
 * Represents a [[ScenarioContext]] implementation that manages a collection of context objects that
 * are created and used by binding classes during a running Cucumber scenario.
 */
class ManagedScenarioContext {
    _scenarioInfo;
    _activeObjects = new Map();
    constructor(scenarioTitle, tags) {
        this._scenarioInfo = new scenario_context_1.ScenarioInfo(scenarioTitle, tags);
    }
    /**
     * Gets information about the scenario.
     *
     */
    get scenarioInfo() {
        return this._scenarioInfo;
    }
    getOrActivateBindingClass(classPrototype, contextTypes, worldObj) {
        return this.getOrActivateObject(classPrototype, () => {
            return this.activateBindingClass(classPrototype, contextTypes, worldObj);
        });
    }
    /**
     * If context objects are passed into our step, this function will
     * call initialize on the context objects only once.
     * Using Promise.resolve so that initialize can be synchronous or async.
     */
    async initialize(startTestCase) {
        for (const [_key, value] of this._activeObjects) {
            if (value.isContext && !value.initialized && typeof value.activeObject.initialize === 'function') {
                await Promise.resolve(value.activeObject.initialize(startTestCase));
                value.initialized = true;
            }
        }
    }
    /**
     * All objects support dispose, which is executed when a
     * test run is ended. Using Promise.resolve to support
     * synchronous or async functions.
     */
    async dispose(endTestCase) {
        for (const [_key, value] of this._activeObjects) {
            if (typeof value.activeObject.dispose === 'function') {
                await Promise.resolve(value.activeObject.dispose(endTestCase));
            }
        }
    }
    activateBindingClass(classPrototype, contextTypes, worldObj) {
        const invokeBindingConstructor = (args) => {
            switch (contextTypes.length) {
                case 0:
                    return new classPrototype.constructor();
                case 1:
                    return new classPrototype.constructor(args[0]);
                case 2:
                    return new classPrototype.constructor(args[0], args[1]);
                case 3:
                    return new classPrototype.constructor(args[0], args[1], args[2]);
                case 4:
                    return new classPrototype.constructor(args[0], args[1], args[2], args[3]);
                case 5:
                    return new classPrototype.constructor(args[0], args[1], args[2], args[3], args[4]);
                case 6:
                    return new classPrototype.constructor(args[0], args[1], args[2], args[3], args[4], args[5]);
                case 7:
                    return new classPrototype.constructor(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
                case 8:
                    return new classPrototype.constructor(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7]);
                case 9:
                    return new classPrototype.constructor(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8]);
                case 10:
                    return new classPrototype.constructor(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9]);
            }
        };
        const contextObjects = underscore_1.default.map(contextTypes, contextType => this.getOrActivateContext(contextType.prototype, (worldObj) => {
            return new contextType(worldObj);
        }, worldObj));
        return invokeBindingConstructor(contextObjects);
    }
    /**
     * Get or activate any object
     *
     * @param classPrototype prototype for the object
     * @param activatorFunc callback function used to create an instance of the object
     * @param optional optional parameter passed into constructors
     * @returns
     */
    getOrActivateObject(classPrototype, activatorFunc, optional) {
        let activeObject = this._activeObjects.get(classPrototype)?.activeObject;
        if (activeObject) {
            return activeObject;
        }
        activeObject = activatorFunc(optional);
        this._activeObjects.set(classPrototype, new ActiveInfo(activeObject));
        return activeObject;
    }
    /**
     * Get or activate Context objects. Marks an object as a context
     * object in ActiveInfo to let the system know it supports an initialize function.
     *
     * @param classPrototype prototype for the object
     * @param activatorFunc callback function used to create an instance of the object
     * @param optional optional parameter passed into constructors
     * @returns
     */
    getOrActivateContext(classPrototype, activatorFunc, optional) {
        let activeObject = this._activeObjects.get(classPrototype)?.activeObject;
        if (activeObject) {
            return activeObject;
        }
        activeObject = activatorFunc(optional);
        this._activeObjects.set(classPrototype, new ActiveInfo(activeObject, true));
        return activeObject;
    }
}
exports.ManagedScenarioContext = ManagedScenarioContext;
__exportStar(require("./scenario-context"), exports);
//# sourceMappingURL=managed-scenario-context.js.map