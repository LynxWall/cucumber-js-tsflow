"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
exports.isVerbose = isVerbose;
exports.safeStringify = safeStringify;
const VERBOSE = process.env.TSFLOW_VERBOSE === 'true';
/**
 * Create a namespaced logger instance
 * @param namespace - Logger namespace (e.g., 'config', 'cli', 'loader')
 */
function createLogger(namespace) {
    const prefix = `[tsflow:${namespace}]`;
    return {
        checkpoint: (stage, detail) => {
            if (!VERBOSE)
                return;
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
            if (!VERBOSE)
                return;
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
function isVerbose() {
    return VERBOSE;
}
/**
 * Safely stringify an object - use when string output is specifically needed
 * (e.g., file logging, concatenation)
 */
function safeStringify(value) {
    if (value === undefined)
        return 'undefined';
    if (value === null)
        return 'null';
    if (typeof value !== 'object')
        return String(value);
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return '[Unable to stringify - circular reference?]';
    }
}
//# sourceMappingURL=tsflow-logger.js.map