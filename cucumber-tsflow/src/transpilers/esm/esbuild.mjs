// lib/transpilers/esm/esbuild.mjs
import { transformSync } from 'esbuild';
import path from 'path';

export const defaultOptions = {
	debug: true
};

const commonOptions = {
	format: 'esm',
	logLevel: 'info',
	target: ['es2022'],
	minify: false,
	sourcemap: 'external',
	platform: 'node'
};

if (global.experimentalDecorators) {
	commonOptions.tsconfigRaw = {
		compilerOptions: {
			experimentalDecorators: true,
			importsNotUsedAsValues: 'remove',
			strict: true
		}
	};
} else {
	commonOptions.tsconfigRaw = {
		compilerOptions: {
			importsNotUsedAsValues: 'remove',
			strict: true
		}
	};
}

export const loaders = {
	'.js': 'js',
	'.mjs': 'js',
	'.cjs': 'js',
	'.jsx': 'jsx',
	'.ts': 'ts',
	'.tsx': 'tsx',
	'.json': 'json'
};

export const supports = filename => {
	// Don't transpile TypeScript files - they're handled by TypeScript compiler
	if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return false;

	// Don't transpile cucumber-tsflow's lib files - they're CommonJS
	if (filename.includes('cucumber-tsflow/lib') || filename.includes('cucumber-tsflow\\lib')) {
		return false;
	}

	// Don't transpile node_modules
	if (filename.includes('node_modules')) return false;

	// Only transpile files in the test project
	if (!filename.includes('cucumber-tsflow-specs')) return false;

	return path.extname(filename) in loaders;
};

const getLoaders = options => {
	const ret = { ...loaders };
	if (typeof options.esbuild?.loader === 'object') {
		for (const [e, l] of Object.entries(options.esbuild.loader)) ret[e] = l;
	}
	return ret;
};

// In esbuild.mjs
export const transpileCode = (code, filename, ext, _options) => {
	const options = { ...defaultOptions, ..._options };
	const loadersMap = getLoaders(options);
	const loaderExt = ext != undefined ? ext : path.extname(filename);

	const ret = transformSync(code, {
		...commonOptions,
		...(options.esbuild || {}),
		loader: loadersMap[loaderExt],
		sourcefile: filename
	});

	return { output: ret.code, sourceMap: ret.map };
};
