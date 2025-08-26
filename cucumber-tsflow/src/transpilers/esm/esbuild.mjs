import { transformSync } from 'esbuild';
import path from 'path';
import { loadConfig } from 'tsconfig-paths';
import { pathToFileURL } from 'url';

export const defaultOptions = {
	debug: true
};

// Cache for tsconfig data
let tsconfigCache = null;

function loadTsConfigPaths() {
	if (tsconfigCache) return tsconfigCache;

	try {
		const configLoaderResult = loadConfig(process.cwd());
		if (configLoaderResult.resultType === 'success') {
			tsconfigCache = {
				absoluteBaseUrl: configLoaderResult.absoluteBaseUrl,
				paths: configLoaderResult.paths
			};
		}
	} catch (error) {
		console.error('Failed to load tsconfig for aliases:', error);
	}

	return tsconfigCache || { paths: {} };
}

// Add this function to handle path replacements
function rewritePathMappings(code) {
	const { absoluteBaseUrl, paths } = loadTsConfigPaths();

	if (!paths || !absoluteBaseUrl) return code;

	let modifiedCode = code;

	// Process each path mapping
	for (const [pattern, replacements] of Object.entries(paths)) {
		// Convert @fixtures/* to a regex pattern
		const searchPattern = pattern.replace('/*', '');
		const replacementPath = replacements[0].replace('/*', '');

		// Create regex to match imports/exports
		const regex = new RegExp(`(from\\s+['"])${searchPattern}(/[^'"]+)?(['"])`, 'g');

		modifiedCode = modifiedCode.replace(regex, (match, prefix, subPath, suffix) => {
			// If subPath is provided, remove leading slash
			const pathSuffix = subPath ? subPath.substring(1) : '';
			// Calculate the absolute path
			const absolutePath = path.resolve(absoluteBaseUrl, replacementPath, pathSuffix);
			// Convert to file URL for ESM
			const fileUrl = pathToFileURL(absolutePath).href;

			return `${prefix}${fileUrl}${suffix}`;
		});
	}

	return modifiedCode;
}
const commonOptions = {
	format: 'esm',
	logLevel: 'info',
	target: ['es2022'],
	minify: false,
	sourcemap: 'external',
	platform: 'node'
};

if (process.env.CUCUMBER_EXPERIMENTAL_DECORATORS === 'true') {
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

	// Rewrite path mappings before transpiling
	let processedCode = rewritePathMappings(code);

	const ret = transformSync(processedCode, {
		...commonOptions,
		...(options.esbuild || {}),
		loader: loadersMap[loaderExt],
		sourcefile: filename
	});

	return { output: ret.code, sourceMap: ret.map };
};
