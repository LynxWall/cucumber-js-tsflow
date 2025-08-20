// This file gets transpiled to CJS via scripts/build-esm-transpiler-cjs as part of the build

import { transpileCode } from './esbuild.mjs';

export function create(_createOptions) {
	return {
		transpile(input, options) {
			const result = transpileCode(input, options.fileName);

			return {
				outputText: result.output,
				sourceMapText: result.sourceMap
			};
		}
	};
}

// Also export as default in case ts-node expects that
export default { create };
