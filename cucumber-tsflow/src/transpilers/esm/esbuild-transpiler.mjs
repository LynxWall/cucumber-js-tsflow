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
