"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasStringValue = void 0;
const value_checker_1 = require("@cucumber/cucumber/lib/value_checker");
/**
 * Tests the argument passed it to see if it's a string with data.
 * @param text
 * @returns true if it's a string with data
 */
const hasStringValue = (text) => {
    const isString = (0, value_checker_1.doesHaveValue)(text) && (typeof text === 'string' || text instanceof String);
    if (isString && text.length > 0) {
        return true;
    }
    return false;
};
exports.hasStringValue = hasStringValue;
//# sourceMappingURL=helpers.js.map