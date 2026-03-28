"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setJestCucumberConfiguration = exports.getJestCucumberConfiguration = exports.defaultConfiguration = exports.defaultErrorSettings = void 0;
exports.defaultErrorSettings = {
    scenariosMustMatchFeatureFile: true,
    stepsMustMatchFeatureFile: true,
    allowScenariosNotInFeatureFile: false
};
exports.defaultConfiguration = {
    tagFilter: undefined,
    scenarioNameTemplate: undefined,
    errors: exports.defaultErrorSettings
};
let globalConfiguration = {};
const getJestCucumberConfiguration = (options) => {
    const mergedOptions = { ...exports.defaultConfiguration, ...globalConfiguration, ...(options || {}) };
    if (mergedOptions.errors === true) {
        mergedOptions.errors = exports.defaultErrorSettings;
    }
    return mergedOptions;
};
exports.getJestCucumberConfiguration = getJestCucumberConfiguration;
const setJestCucumberConfiguration = (options) => {
    globalConfiguration = options;
};
exports.setJestCucumberConfiguration = setJestCucumberConfiguration;
//# sourceMappingURL=configuration.js.map