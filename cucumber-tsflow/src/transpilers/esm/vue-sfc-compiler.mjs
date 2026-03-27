import { createRequire } from 'node:module';
import { createLogger } from '../../utils/tsflow-logger.mjs';

// Load the shared CJS compiler. It lives one directory up from this ESM file.
const require = createRequire(import.meta.url);
const { compileVueSFC: _compile } = require('../vue-sfc-compiler.js');

const logger = createLogger('vue-sfc');

/**
 * Compile a Vue Single File Component to an ESM JavaScript module.
 *
 * Delegates to the shared CJS compiler (vue-sfc-compiler.js) with
 * format set to 'esm', so the returned code can be used directly as
 * the source in a Node.js ESM loader hook.
 *
 * @param {string} source - Raw .vue file content
 * @param {string} filename - Absolute path to the .vue file
 * @param {Object} options - Compilation options
 * @param {boolean} options.enableStyle - Whether to process <style> blocks
 * @returns {{ code: string }} - Compiled ESM JavaScript module
 */
export function compileVueSFC(source, filename, options = {}) {
	logger.checkpoint('compileVueSFC (ESM wrapper)', { filename });
	return _compile(source, filename, { ...options, format: 'esm' });
}
