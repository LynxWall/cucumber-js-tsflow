"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasMatchingTags = exports.hasMatchingStep = void 0;
const logical_expression_parser_1 = __importDefault(require("@jeanbenitez/logical-expression-parser"));
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Uses a regular expression to match a step expression with
 * the feature text passed in
 * @param stepText
 * @param featureText
 * @returns
 */
const hasMatchingStep = (stepText, featureText) => {
    if (stepText.trim().length === 0)
        return false;
    try {
        const regexStep = new RegExp(getRegTextForStep(stepText));
        const match = featureText.match(regexStep);
        return match !== null && match.length > 0;
    }
    catch (err) {
        logger_1.default.error(err.message);
        return false;
    }
};
exports.hasMatchingStep = hasMatchingStep;
/**
 * Helper that uses a lexical parser to apply the tag patterns used by
 * Cucumber to associate hooks with scenario and feature tags
 * @param tagPattern examples: 'tag1', 'tag1 and tag2', 'tag1 or tag2)
 * @param tags
 * @returns
 */
const hasMatchingTags = (tagPattern, tags) => {
    return logical_expression_parser_1.default.parse(tagPattern.toLowerCase(), (t) => tags.map(tag => tag.toLowerCase()).includes(t));
};
exports.hasMatchingTags = hasMatchingTags;
const getRegTextForStep = (step) => {
    //Ruby interpolation (like `#{Something}` ) should be replaced with `.*`
    //https://github.com/alexkrechik/VSCucumberAutoComplete/issues/65
    step = step.replace(/#{(.*?)}/g, '.*');
    //Parameter-types
    //https://github.com/alexkrechik/VSCucumberAutoComplete/issues/66
    //https://docs.cucumber.io/cucumber/cucumber-expressions/
    step = step.replace(/{float}/g, '-?\\d*\\.?\\d+');
    step = step.replace(/{bigdecimal}/g, '-?\\d*\\.?\\d+');
    step = step.replace(/{double}/g, '-?\\d*\\.?\\d+');
    step = step.replace(/{int}/g, '-?\\d+');
    step = step.replace(/{biginteger}/g, '-?\\d+');
    step = step.replace(/{byte}/g, '-?\\d+');
    step = step.replace(/{short}/g, '-?\\d+');
    step = step.replace(/{long}/g, '-?\\d+');
    step = step.replace(/{stringInDoubleQuotes}/g, '"[^"]+"');
    step = step.replace(/{word}/g, '[A-Za-z]+');
    step = step.replace(/{string}/g, '("|\')[^\\1]*\\1');
    step = step.replace(/{boolean}/g, 'true|false');
    step = step.replace(/{}/g, '.*');
    //Optional Text
    step = step.replace(/\(([a-z]+)\)/g, '($1)?');
    //Alternative text a/b/c === (a|b|c)
    step = step.replace(/([a-zA-Z]+)(?:\/([a-zA-Z]+))+/g, match => `(${match.replace(/\//g, '|')})`);
    //Handle Cucumber Expressions (like `{Something}`) should be replaced with `.*`
    //https://github.com/alexkrechik/VSCucumberAutoComplete/issues/99
    //Cucumber Expressions Custom Parameter Type Documentation
    //https://docs.cucumber.io/cucumber-expressions/#custom-parameters
    step = step.replace(/([^\\]|^){(?![\d,])(.*?)}/g, '$1.*');
    //Escape all the regex symbols to avoid errors
    step = escapeRegExp(step);
    return step;
};
const escapeRegExp = (str) => {
    // eslint-disable-next-line no-useless-escape
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '$&');
};
//# sourceMappingURL=utils.js.map