/**
 * Verbose logging utility for cucumber-tsflow
 *
 * Enable with: TSFLOW_VERBOSE=true
 *
 * Usage:
 *   import { createLogger } from '../utils/tsflow-logger';
 *   const logger = createLogger('config');
 *   logger.checkpoint('Loading file...', { path: '/some/path' });
 */

const VERBOSE = process.env.TSFLOW_VERBOSE === 'true';

/** How many `cause` links `formatThrowable` follows; a cycle or a very deep chain stops here. */
const MAX_CAUSE_DEPTH = 8;

export interface TsFlowLogger {
	checkpoint: (stage: string, detail?: unknown) => void;
	/** Always printed: the stage, then the error and its causes, one line each (`formatThrowable`). */
	error: (stage: string, error?: unknown, detail?: unknown) => void;
	warn: (stage: string, detail?: unknown) => void;
}

/**
 * Create a namespaced logger instance
 * @param namespace - Logger namespace (e.g., 'config', 'cli', 'loader')
 */
export function createLogger(namespace: string): TsFlowLogger {
	const prefix = `[tsflow:${namespace}]`;

	return {
		checkpoint: (stage: string, detail?: unknown): void => {
			if (!VERBOSE) return;

			console.log(`${prefix} ${stage}`);
			if (detail !== undefined) {
				console.log(`${prefix}   └─`, detail);
			}
		},

		error: (stage: string, error?: unknown, detail?: unknown): void => {
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

		warn: (stage: string, detail?: unknown): void => {
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
export function isVerbose(): boolean {
	return VERBOSE;
}

/**
 * The message of anything that was thrown: an `Error`'s message, the text of a primitive, or a description of an
 * object that has neither (what an error thrown on Node's loader hooks thread arrives as when its class does not
 * survive the structured clone: an empty object with no prototype, which `String()` cannot even convert).
 */
export function messageOf(value: unknown): string {
	if (typeof value === 'object' && value !== null) {
		const { message } = value as { message?: unknown };
		if (typeof message === 'string') return message;
		try {
			return `${String(value)} (the thrown value is not an Error)`;
		} catch {
			return `${Object.prototype.toString.call(value)} (the thrown value is not an Error)`;
		}
	}
	return String(value);
}

/** `Name: message` for anything that was thrown; the name is `Error` when the value does not carry one. */
export function describeThrowable(value: unknown): string {
	if (typeof value === 'object' && value !== null) {
		const { name, message } = value as { name?: unknown; message?: unknown };
		if (typeof message === 'string') return `${typeof name === 'string' && name ? name : 'Error'}: ${message}`;
	}
	return messageOf(value);
}

/**
 * The error and its `cause` chain, one per line: `Name: message`, then `caused by Name: message` for each cause
 * whose message the level above did not already embed (the wrappers in this code base do `Failed to X:
 * ${error.message}` and keep the cause, so printing both would repeat every message). With `TSFLOW_VERBOSE`
 * the stack of each error follows its line.
 */
export function formatThrowable(value: unknown): string {
	const lines: string[] = [];
	let current: unknown = value;
	let parent: unknown;
	for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== undefined; depth++) {
		const message = messageOf(current);
		const embedded = parent !== undefined && messageOf(parent).includes(message);
		if (!embedded) {
			lines.push(depth === 0 ? describeThrowable(current) : `caused by ${describeThrowable(current)}`);
			const stack = VERBOSE ? stackOf(current) : undefined;
			if (stack) lines.push(stack);
		}
		parent = current;
		current = causeOf(current);
	}
	return lines.join('\n');
}

function causeOf(value: unknown): unknown {
	return typeof value === 'object' && value !== null ? (value as { cause?: unknown }).cause : undefined;
}

/** The stack from its first frame, without the heading that repeats the name and message. */
function stackOf(value: unknown): string | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const { stack } = value as { stack?: unknown };
	if (typeof stack !== 'string') return undefined;
	const at = stack.search(/^\s+at /m);
	return at >= 0 ? stack.slice(at) : undefined;
}

/**
 * Safely stringify an object - use when string output is specifically needed
 * (e.g., file logging, concatenation)
 */
export function safeStringify(value: unknown): string {
	if (value === undefined) return 'undefined';
	if (value === null) return 'null';
	if (typeof value !== 'object') return String(value);

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return '[Unable to stringify - circular reference?]';
	}
}
