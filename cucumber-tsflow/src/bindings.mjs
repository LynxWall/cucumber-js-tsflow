import bindings from './bindings.js';

export const supportCodeLibraryBuilder = bindings.supportCodeLibraryBuilder;
export const DataTable = bindings.DataTable;
export const TestCaseHookDefinition = bindings.TestCaseHookDefinition;

// Decorators
export const binding = bindings.binding;
export const beforeAll = bindings.beforeAll;
export const before = bindings.before;
export const beforeStep = bindings.beforeStep;
export const afterAll = bindings.afterAll;
export const after = bindings.after;
export const afterStep = bindings.afterStep;
export const given = bindings.given;
export const when = bindings.when;
export const then = bindings.then;

export const ScenarioInfo = bindings.ScenarioInfo;

export const defineParameterType = bindings.defineParameterType;
export const setDefaultTimeout = bindings.setDefaultTimeout;
export const setDefinitionFunctionWrapper = bindings.setDefinitionFunctionWrapper;
export const setWorldConstructor = bindings.setWorldConstructor;
export const setParallelCanAssign = bindings.setParallelCanAssign;

export const World = bindings.World;
export const world = bindings.world;
export const context = bindings.context;
export const parallelCanAssignHelpers = bindings.parallelCanAssignHelpers;
export const Status = bindings.Status;

export const wrapPromiseWithTimeout = bindings.wrapPromiseWithTimeout;
