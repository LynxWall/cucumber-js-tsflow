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

/**
 * Formats a duration for humans, scaling the unit to the magnitude: `412ms`, `28.9s`, `2m 14s`.
 * @param ms duration in milliseconds
 */
export function formatDuration(ms: number): string {
	// Round before picking the unit so 999.6 ms does not print as 1000ms, nor 59.96 s as 60.0s
	if (Math.round(ms) < 1000) return `${Math.round(ms)}ms`;
	const seconds = ms / 1000;
	if (Number(seconds.toFixed(1)) < 60) return `${seconds.toFixed(1)}s`;
	const whole = Math.round(seconds);
	return `${Math.floor(whole / 60)}m ${whole % 60}s`;
}
