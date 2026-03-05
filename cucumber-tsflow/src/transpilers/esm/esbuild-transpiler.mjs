// This file gets transpiled to CJS via scripts/build-esm-transpiler-cjs as part of the build

import { transpileCode } from './esbuild.mjs';
import { createLogger } from '../../utils/tsflow-logger.mjs';

const logger = createLogger('esbuild-transpiler');

export function create(_createOptions) {
	logger.checkpoint('create() called');

	return {
		transpile(input, options) {
			logger.checkpoint('transpile', {
				fileName: options.fileName,
				inputLength: input?.length
			});

			try {
				const result = transpileCode(input, options.fileName);

				logger.checkpoint('transpile success', {
					fileName: options.fileName,
					outputLength: result.output?.length
				});

				return {
					outputText: result.output,
					sourceMapText: result.sourceMap
				};
			} catch (error) {
				logger.error('transpile failed', error, {
					fileName: options.fileName
				});
				throw error;
			}
		}
	};
}

export default { create };
