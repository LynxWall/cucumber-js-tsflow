import lep from '@jeanbenitez/logical-expression-parser';
import logger from '../utils/logger';

/**
 * Uses a regular expression to match a step expression with
 * the feature text passed in
 * @param stepText
 * @param featureText
 * @returns
 */
export const hasMatchingStep = (stepText: string, featureText: string): boolean => {
	if (stepText.trim().length === 0) return false;

	try {
		const regexStep = new RegExp(getRegTextForStep(stepText));
		const match = featureText.match(regexStep);
		return match !== null && match.length > 0;
	} catch (err) {
		logger.error((err as any).message);
		return false;
	}
};

/**
 * Helper that uses a lexical parser to apply the tag patterns used by
 * Cucumber to associate hooks with scenario and feature tags
 * @param tagPattern examples: 'tag1', 'tag1 and tag2', 'tag1 or tag2)
 * @param tags
 * @returns
 */
export const hasMatchingTags = (tagPattern: string, tags: string[]): boolean => {
	return lep.parse(tagPattern.toLowerCase(), (t: string) => tags.map(tag => tag.toLowerCase()).includes(t));
};

const getRegTextForStep = (step: string): string => {
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
	step = step.replace(/{boolean}/gi, '(true|false)');
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

const escapeRegExp = (str: string): string => {
	// eslint-disable-next-line no-useless-escape
	return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '$&');
};
