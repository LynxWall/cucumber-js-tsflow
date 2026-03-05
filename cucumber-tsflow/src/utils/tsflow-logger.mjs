/**
 * Verbose logging utility for cucumber-tsflow (ESM version)
 *
 * Enable with: TSFLOW_VERBOSE=true
 *
 * Usage:
 *   import { createLogger } from '../utils/tsflow-logger.mjs';
 *   const logger = createLogger('loader');
 *   logger.checkpoint('Loading file...', { path: '/some/path' });
 */

const VERBOSE = process.env.TSFLOW_VERBOSE === 'true';

/**
 * Create a namespaced logger instance
 * @param {string} namespace - Logger namespace (e.g., 'config', 'cli', 'loader')
 */
export function createLogger(namespace) {
	const prefix = `[tsflow:${namespace}]`;

	return {
		checkpoint: (stage, detail) => {
			if (!VERBOSE) return;

			console.log(`${prefix} ${stage}`);
			if (detail !== undefined) {
				console.log(`${prefix}   └─`, detail);
			}
		},

		error: (stage, error, detail) => {
			// Errors always log, but verbosity controls detail level
			console.error(`${prefix}:ERROR ${stage}`);

			if (error) {
				console.error(`${prefix}   └─ ${error.name}: ${error.message}`);
				if (VERBOSE && error.stack) {
					console.error(`${prefix}   └─ Stack:`, error.stack);
				}
			}

			if (detail !== undefined && VERBOSE) {
				console.error(`${prefix}   └─ Detail:`, detail);
			}
		},

		warn: (stage, detail) => {
			if (!VERBOSE) return;

			console.warn(`${prefix}:WARN ${stage}`);
			if (detail !== undefined) {
				console.warn(`${prefix}   └─`, detail);
			}
		}
	};
}

/**
 * Check if verbose logging is enabled
 */
export function isVerbose() {
	return VERBOSE;
}

/**
 * Safely stringify an object - use when string output is specifically needed
 */
export function safeStringify(value) {
	if (value === undefined) return 'undefined';
	if (value === null) return 'null';
	if (typeof value !== 'object') return String(value);

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return '[Unable to stringify - circular reference?]';
	}
}
