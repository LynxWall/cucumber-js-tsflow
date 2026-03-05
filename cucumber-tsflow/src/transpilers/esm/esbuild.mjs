import { transformSync } from 'esbuild';
import path from 'path';
import { loadConfig } from 'tsconfig-paths';
import { pathToFileURL } from 'url';
import { createLogger } from '../../utils/tsflow-logger.mjs';

const logger = createLogger('esbuild');

export const defaultOptions = {
	debug: true
};

// Cache for tsconfig data
let tsconfigCache = null;

function loadTsConfigPaths() {
	if (tsconfigCache) {
		logger.checkpoint('loadTsConfigPaths (cached)');
		return tsconfigCache;
	}

	logger.checkpoint('loadTsConfigPaths');

	try {
		const configLoaderResult = loadConfig(process.cwd());
		logger.checkpoint('tsconfig loadConfig result', {
			resultType: configLoaderResult.resultType,
			cwd: process.cwd()
		});

		if (configLoaderResult.resultType === 'success') {
			tsconfigCache = {
				absoluteBaseUrl: configLoaderResult.absoluteBaseUrl,
				paths: configLoaderResult.paths
			};
			logger.checkpoint('tsconfig paths cached', {
				absoluteBaseUrl: tsconfigCache.absoluteBaseUrl,
				pathCount: Object.keys(tsconfigCache.paths || {}).length
			});
		}
	} catch (error) {
		logger.error('Failed to load tsconfig for aliases', error);
	}

	return tsconfigCache || { paths: {} };
}

function rewritePathMappings(code, filename) {
	const { absoluteBaseUrl, paths } = loadTsConfigPaths();

	if (!paths || !absoluteBaseUrl) {
		logger.checkpoint('rewritePathMappings skipped (no paths)', { filename });
		return code;
	}

	let modifiedCode = code;
	let replacementCount = 0;

	for (const [pattern, replacements] of Object.entries(paths)) {
		const searchPattern = pattern.replace('/*', '');
		const replacementPath = replacements[0].replace('/*', '');

		const regex = new RegExp(`(from\\s+['"])${searchPattern}(/[^'"]+)?(['"])`, 'g');

		modifiedCode = modifiedCode.replace(regex, (match, prefix, subPath, suffix) => {
			const pathSuffix = subPath ? subPath.substring(1) : '';
			const absolutePath = path.resolve(absoluteBaseUrl, replacementPath, pathSuffix);
			const fileUrl = pathToFileURL(absolutePath).href;

			replacementCount++;
			logger.checkpoint('Path mapping replaced', {
				from: `${searchPattern}${subPath || ''}`,
				to: fileUrl
			});

			return `${prefix}${fileUrl}${suffix}`;
		});
	}

	if (replacementCount > 0) {
		logger.checkpoint('rewritePathMappings complete', { filename, replacementCount });
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
	logger.checkpoint('Experimental decorators enabled');
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
	if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return false;
	if (filename.includes('cucumber-tsflow/lib') || filename.includes('cucumber-tsflow\\lib')) {
		return false;
	}
	if (filename.includes('node_modules')) return false;
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

export const transpileCode = (code, filename, ext, _options) => {
	logger.checkpoint('transpileCode', {
		filename,
		ext,
		codeLength: code?.length
	});

	const options = { ...defaultOptions, ..._options };
	const loadersMap = getLoaders(options);
	const loaderExt = ext != undefined ? ext : path.extname(filename);

	logger.checkpoint('Rewriting path mappings', { filename });
	let processedCode = rewritePathMappings(code, filename);

	logger.checkpoint('Calling esbuild transformSync', {
		filename,
		loader: loadersMap[loaderExt],
		processedCodeLength: processedCode?.length
	});

	try {
		const ret = transformSync(processedCode, {
			...commonOptions,
			...(options.esbuild || {}),
			loader: loadersMap[loaderExt],
			sourcefile: filename
		});

		logger.checkpoint('esbuild transformSync success', {
			filename,
			outputLength: ret.code?.length
		});

		return { output: ret.code, sourceMap: ret.map };
	} catch (error) {
		logger.error('esbuild transformSync failed', error, {
			filename,
			loader: loadersMap[loaderExt],
			codePreview: processedCode?.substring(0, 200)
		});
		throw error;
	}
};
