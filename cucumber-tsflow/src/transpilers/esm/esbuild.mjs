import path from 'path';
import { createRequire } from 'node:module';
import { loadConfig } from 'tsconfig-paths';
import { pathToFileURL } from 'url';
import { createLogger, describeThrowable, isVerbose } from '../../utils/tsflow-logger.mjs';

// The transform itself is the CJS build's `transpilers/esbuild.js` (options table, loaders table, cache-key
// recipe and timing), shared with ts-node's transpiler plugin; this module adds what only an ES module
// needs: tsconfig path aliases rewritten to file:// URLs before the transform, and `format: 'esm'`. The
// on-disk transpile cache is loaded the same way, so all of the transpilers keep one set of counters per thread.
const require = createRequire(import.meta.url);
const { transformOptionsFor, esbuildCacheKey, runEsbuild } = require('../esbuild.js');
const { withTranspileCache } = require('../transpile-cache.js');
const { experimentalDecorators } = require('../../utils/decorator-mode.js');

const logger = createLogger('esbuild');

// Per-file checkpoints are guarded so their detail objects are never built when verbose logging is off
const verbose = isVerbose();

/** ES modules for Node: the one thing this caller fixes that the CommonJS transpiler does not. */
const OUTPUT = { format: 'esm', platform: 'node' };

// Cache for tsconfig data
let tsconfigCache = null;

// Compile the tsconfig path-mapping regexes once per process; rewritePathMappings runs them once per file.
function compilePathMappings(paths) {
	return Object.entries(paths || {}).map(([pattern, replacements]) => {
		const searchPattern = pattern.replace('/*', '');
		return {
			searchPattern,
			replacementPath: replacements[0].replace('/*', ''),
			regex: new RegExp(`(from\\s+['"])${searchPattern}(/[^'"]+)?(['"])`, 'g')
		};
	});
}

function loadTsConfigPaths() {
	if (tsconfigCache) {
		if (verbose) logger.checkpoint('loadTsConfigPaths (cached)');
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
				paths: configLoaderResult.paths,
				mappings: compilePathMappings(configLoaderResult.paths)
			};
			logger.checkpoint('tsconfig paths cached', {
				absoluteBaseUrl: tsconfigCache.absoluteBaseUrl,
				pathCount: Object.keys(tsconfigCache.paths || {}).length
			});
		}
	} catch (error) {
		logger.error('Failed to load tsconfig for aliases', error);
	}

	return tsconfigCache || { paths: {}, mappings: [] };
}

function rewritePathMappings(code, filename) {
	const { absoluteBaseUrl, paths, mappings } = loadTsConfigPaths();

	if (!paths || !absoluteBaseUrl) {
		if (verbose) logger.checkpoint('rewritePathMappings skipped (no paths)', { filename });
		return code;
	}

	let modifiedCode = code;
	let replacementCount = 0;

	for (const { searchPattern, replacementPath, regex } of mappings) {
		modifiedCode = modifiedCode.replace(regex, (match, prefix, subPath, suffix) => {
			const pathSuffix = subPath ? subPath.substring(1) : '';
			const absolutePath = path.resolve(absoluteBaseUrl, replacementPath, pathSuffix);
			const fileUrl = pathToFileURL(absolutePath).href;

			replacementCount++;
			if (verbose) {
				logger.checkpoint('Path mapping replaced', {
					from: `${searchPattern}${subPath || ''}`,
					to: fileUrl
				});
			}

			return `${prefix}${fileUrl}${suffix}`;
		});
	}

	if (verbose && replacementCount > 0) {
		logger.checkpoint('rewritePathMappings complete', { filename, replacementCount });
	}

	return modifiedCode;
}

/** Transpile `code` to an ES module, through the transpile cache, with tsconfig path aliases rewritten first. */
export const transpileCode = (code, filename, ext, _options) => {
	if (verbose) {
		logger.checkpoint('transpileCode', {
			filename,
			ext,
			codeLength: code?.length
		});
	}

	const transformOptions = transformOptionsFor(filename, ext, _options, OUTPUT, experimentalDecorators());

	// Cached on the original source. The key must also carry what rewritePathMappings bakes into the
	// output (absolute file:// URLs built from the tsconfig baseUrl and paths).
	const { absoluteBaseUrl, paths } = loadTsConfigPaths();
	const configuration = esbuildCacheKey(transformOptions) + JSON.stringify({ absoluteBaseUrl, paths });

	return withTranspileCache('esbuild', filename, code, configuration, () => {
		if (verbose) logger.checkpoint('Rewriting path mappings', { filename });
		const processedCode = rewritePathMappings(code, filename);

		if (verbose) {
			logger.checkpoint('Calling esbuild transformSync', {
				filename,
				loader: transformOptions.loader,
				processedCodeLength: processedCode?.length
			});
		}

		try {
			const ret = runEsbuild(processedCode, filename, transformOptions);

			if (verbose) {
				logger.checkpoint('esbuild transformSync success', {
					filename,
					outputLength: ret.output?.length
				});
			}

			return ret;
		} catch (error) {
			// The error propagates to the CLI, which reports it once; only the verbose trail keeps a copy here
			if (verbose) {
				logger.checkpoint('esbuild transformSync failed', {
					filename,
					loader: transformOptions.loader,
					codePreview: processedCode?.substring(0, 200),
					error: describeThrowable(error)
				});
			}
			throw error;
		}
	});
};
