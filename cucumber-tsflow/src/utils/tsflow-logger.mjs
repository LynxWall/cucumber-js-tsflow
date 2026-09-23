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

/** How many `cause` links `formatThrowable` follows; a cycle or a very deep chain stops here. */
const MAX_CAUSE_DEPTH = 8;

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

		/** Always printed: the stage, then the error and its causes, one line each (`formatThrowable`). */
		error: (stage, error, detail) => {
			// Errors always log, but verbosity controls detail level
			console.error(`${prefix}:ERROR ${stage}`);

			if (error !== undefined) {
				// The first line gets the branch; the rest of the message, the causes and any stacks hang under it
				const [first, ...rest] = formatThrowable(error).split('\n');
				console.error(`${prefix}   └─ ${first}`);
				for (const line of rest) {
					console.error(`${prefix}      ${line}`);
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
 * The message of anything that was thrown: an `Error`'s message, the text of a primitive, or a description of an
 * object that has neither (what an error thrown on Node's loader hooks thread arrives as when its class does not
 * survive the structured clone: an empty object with no prototype, which `String()` cannot even convert).
 * @param {unknown} value
 * @returns {string}
 */
export function messageOf(value) {
	if (typeof value === 'object' && value !== null) {
		if (typeof value.message === 'string') return value.message;
		try {
			return `${String(value)} (the thrown value is not an Error)`;
		} catch {
			return `${Object.prototype.toString.call(value)} (the thrown value is not an Error)`;
		}
	}
	return String(value);
}

/**
 * `Name: message` for anything that was thrown; the name is `Error` when the value does not carry one.
 * @param {unknown} value
 * @returns {string}
 */
export function describeThrowable(value) {
	if (typeof value === 'object' && value !== null && typeof value.message === 'string') {
		return `${typeof value.name === 'string' && value.name ? value.name : 'Error'}: ${value.message}`;
	}
	return messageOf(value);
}

/**
 * The error and its `cause` chain, one per line: `Name: message`, then `caused by Name: message` for each cause
 * whose message the level above did not already embed (the wrappers in this code base do `Failed to X:
 * ${error.message}` and keep the cause, so printing both would repeat every message). With `TSFLOW_VERBOSE`
 * the stack of each error follows its line.
 * @param {unknown} value
 * @returns {string}
 */
export function formatThrowable(value) {
	const lines = [];
	let current = value;
	let parent;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== undefined; depth++) {
		const message = messageOf(current);
		const embedded = parent !== undefined && messageOf(parent).includes(message);
		if (!embedded) {
			lines.push(depth === 0 ? describeThrowable(current) : `caused by ${describeThrowable(current)}`);
			const stack = VERBOSE ? stackOf(current) : undefined;
			if (stack) lines.push(stack);
		}
		parent = current;
		current = typeof current === 'object' && current !== null ? current.cause : undefined;
	}
	return lines.join('\n');
}

/** The stack from its first frame, without the heading that repeats the name and message. */
function stackOf(value) {
	if (typeof value !== 'object' || value === null || typeof value.stack !== 'string') return undefined;
	const at = value.stack.search(/^\s+at /m);
	return at >= 0 ? value.stack.slice(at) : undefined;
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
