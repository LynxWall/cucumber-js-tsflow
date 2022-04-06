import { doesHaveValue } from '@cucumber/cucumber/lib/value_checker';

/**
 * Tests the argument passed it to see if it's a string with data.
 * @param text
 * @returns true if it's a string with data
 */
export const hasStringValue = (text: any): boolean => {
	const isString = doesHaveValue(text) && (typeof text === 'string' || text instanceof String);
	if (isString && text.length > 0) {
		return true;
	}
	return false;
};
