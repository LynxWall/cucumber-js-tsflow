import { compileVueSFC } from './vue-sfc-compiler.mjs';
import { transpileCode } from './esbuild.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { createMatchPath, loadConfig } from 'tsconfig-paths';
import { createRequire } from 'node:module';
import { createLogger, describeThrowable, isVerbose } from '../../utils/tsflow-logger.mjs';
import { startTimer, recordPhase, recordFile } from '../../utils/tsflow-timing.mjs';

// The import-graph recorder is a CJS module shared with the main process (selective loading reads what
// the in-thread resolve hook records here, and watch mode's module versions are applied to every URL the
// hook resolves); loaded the way esbuild.mjs loads the transpile cache.
const require = createRequire(import.meta.url);
const { recordImportEdge, versionedUrl, withoutQuery, addReloadListener } = require('../../utils/module-graph.js');

// Every helper in this file is synchronous and never inspects the value returned by `nextResolve` /
// `nextLoad`, so the same hook functions work under both registration mechanisms: `module.registerHooks()`
// (synchronous, in-thread - `next*` returns a value) and `module.register()` (asynchronous, on the loader
// hooks thread - `next*` returns a promise that is handed straight back to Node).

// Create loggers for different concerns
const loggerUtils = createLogger('loader-utils');
const loggerResolve = createLogger('resolve');
const loggerLoad = createLogger('load');

// Per-file checkpoints in the resolve/load hot paths are guarded so their detail
// objects and template strings are never built when verbose logging is off.
const verbose = isVerbose();

// Shared asset extensions
export const ASSET_EXTENSIONS = [
	'.jpg',
	'.jpeg',
	'.png',
	'.gif',
	'.svg',
	'.webp',
	'.ico',
	'.woff',
	'.woff2',
	'.ttf',
	'.eot'
];
export const CODE_EXTENSIONS = ['.vue', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/**
 * True when the hook was invoked for a CommonJS `require()`. Synchronous hooks registered with
 * `module.registerHooks()` see every `require()` in the thread as well as every `import`; the
 * transpilation, extension probing and `format: 'module'` short-circuits here are only correct for
 * `import`, so `require()` requests must be handed straight to the default loader. Hooks registered with
 * `module.register()` never receive `require()` calls, so this is always false there.
 */
export function isRequire(context) {
	return context?.conditions?.includes('require') === true;
}

// TSConfig paths initialization
let matchPath;
export function initializeTsconfigPaths() {
	if (matchPath) return matchPath;

	loggerUtils.checkpoint('Initializing tsconfig paths');

	try {
		const configLoaderResult = loadConfig(process.cwd());
		loggerUtils.checkpoint('tsconfig loadConfig result', {
			resultType: configLoaderResult.resultType,
			cwd: process.cwd()
		});

		if (configLoaderResult.resultType === 'success') {
			matchPath = createMatchPath(
				configLoaderResult.absoluteBaseUrl,
				configLoaderResult.paths,
				configLoaderResult.mainFields,
				configLoaderResult.addMatchAll
			);
			loggerUtils.checkpoint('tsconfig paths initialized', {
				baseUrl: configLoaderResult.absoluteBaseUrl,
				pathCount: Object.keys(configLoaderResult.paths || {}).length
			});
		} else {
			loggerUtils.warn('No tsconfig paths found', { result: configLoaderResult });
		}
	} catch (error) {
		loggerUtils.error('Failed to load tsconfig paths', error);
	}

	return matchPath;
}

// Extension-probe cache: absolute extensionless path (plus the extension list when it is not the
// default) -> resolved file URL, or null when nothing matched. Keying on the resolved path rather
// than on specifier + parentURL means `../fixtures/context` imported from ten files in one directory
// and `@fixtures/context` mapped to the same location all share a single set of existsSync probes.
// Negative results are cached too. Both caches live for the process lifetime, which is correct for a
// one-shot CLI run; a long-lived process that adds, removes or moves files must call
// clearResolutionCaches() before resolving again.
const extensionResolutionCache = new Map();

function probeExtensions(resolvedPath, extensions) {
	// Try various extensions
	for (const ext of extensions) {
		const fullPath = resolvedPath + ext;
		if (existsSync(fullPath)) {
			const result = pathToFileURL(fullPath).href;
			if (verbose) loggerResolve.checkpoint('Resolved with extension', { ext, result });
			return result;
		}
	}

	// Try index files
	for (const ext of extensions) {
		const indexPath = path.join(resolvedPath, 'index' + ext);
		if (existsSync(indexPath)) {
			const result = pathToFileURL(indexPath).href;
			if (verbose) loggerResolve.checkpoint('Resolved as index file', { ext, result });
			return result;
		}
	}

	return null;
}

// Extension resolution helper
export function resolveWithExtensions(specifier, parentURL, extensions = CODE_EXTENSIONS) {
	if (verbose) loggerResolve.checkpoint('resolveWithExtensions', { specifier, parentURL });

	let resolvedPath;

	try {
		if (specifier.startsWith('file://')) {
			resolvedPath = fileURLToPath(specifier);
		} else {
			const parentPath = fileURLToPath(parentURL);
			const parentDir = path.dirname(parentPath);
			resolvedPath = path.resolve(parentDir, specifier);
		}
		if (verbose) loggerResolve.checkpoint('Resolved base path', { resolvedPath });
	} catch (error) {
		loggerResolve.error('Failed to resolve base path', error, { specifier, parentURL });
		return null;
	}

	const cacheKey = extensions === CODE_EXTENSIONS ? resolvedPath : `${resolvedPath}\0${extensions.join(',')}`;
	let result = extensionResolutionCache.get(cacheKey);

	if (result === undefined) {
		result = probeExtensions(resolvedPath, extensions);
		extensionResolutionCache.set(cacheKey, result);
	} else if (verbose) {
		loggerResolve.checkpoint('Resolved from extension cache', { resolvedPath, result });
	}

	if (result === null && verbose) loggerResolve.checkpoint('No resolution found', { specifier });
	return result;
}

const pathResolutionCache = new Map();

// Drops every cached resolution result. Never needed by a one-shot run; watch mode calls it (through the
// reload listener below) before each rerun, since files may have been added, removed or moved.
export function clearResolutionCaches() {
	extensionResolutionCache.clear();
	pathResolutionCache.clear();
}
addReloadListener(clearResolutionCaches);

export function resolveTsconfigPaths(specifier) {
	// Fast path: skip what we know won't match
	if (
		specifier.startsWith('.') ||
		specifier.startsWith('/') ||
		specifier.startsWith('file:') ||
		specifier.startsWith('node:')
	) {
		return null;
	}

	// Check cache
	if (pathResolutionCache.has(specifier)) {
		return pathResolutionCache.get(specifier);
	}

	if (verbose) loggerResolve.checkpoint('resolveTsconfigPaths', { specifier });

	const matchPath = initializeTsconfigPaths();
	if (!matchPath) {
		pathResolutionCache.set(specifier, null);
		return null;
	}

	// Try direct match first
	try {
		const mapped = matchPath(specifier);
		if (mapped) {
			const result = {
				url: pathToFileURL(mapped).href,
				format: 'module',
				shortCircuit: true
			};
			if (verbose) loggerResolve.checkpoint('tsconfig path matched', { specifier, mapped });
			pathResolutionCache.set(specifier, result);
			return result;
		}
	} catch (error) {
		loggerResolve.error('matchPath failed', error, { specifier });
	}

	// Try with extensions if no extension present
	if (!path.extname(specifier)) {
		for (const ext of ['.ts', '.js', '.mjs', '.vue']) {
			try {
				const mappedWithExt = matchPath(specifier + ext);
				if (mappedWithExt) {
					const result = {
						url: pathToFileURL(mappedWithExt).href,
						format: 'module',
						shortCircuit: true
					};
					if (verbose) {
						loggerResolve.checkpoint('tsconfig path matched with extension', {
							specifier,
							ext,
							mapped: mappedWithExt
						});
					}
					pathResolutionCache.set(specifier, result);
					return result;
				}
			} catch (error) {
				loggerResolve.error('matchPath with extension failed', error, { specifier, ext });
			}
		}
	}

	pathResolutionCache.set(specifier, null);
	return null;
}

// Reads a module's source from disk. The hooks read files themselves rather than asking `nextLoad`,
// because the default `nextLoad` returns a value under registerHooks() and a promise under register().
function readSource(url) {
	return readFileSync(fileURLToPath(url), 'utf8');
}

// Asset loader helper
export function loadAsset(url) {
	if (verbose) loggerLoad.checkpoint('loadAsset', { url });
	const filePath = fileURLToPath(url);
	return {
		format: 'module',
		source: `export default ${JSON.stringify(filePath)};`,
		shortCircuit: true
	};
}

// Vue style configuration helper
export function shouldEnableVueStyle() {
	const enabled =
		global.enableVueStyle === true ||
		process.env.CUCUMBER_ENABLE_VUE_STYLE === 'true' ||
		process.env.enableVueStyle === 'true';
	if (verbose) loggerUtils.checkpoint('shouldEnableVueStyle', { enabled });
	return enabled;
}

function transformImports(code, parentURL) {
	if (verbose) loggerLoad.checkpoint('transformImports', { parentURL, codeLength: code?.length });

	try {
		const importRegex =
			/(?:import|export)\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+|type\s+\{[^}]*\}|type\s+\w+)\s+from\s+)?['"]([^'"]+)['"]/g;

		const matches = [...code.matchAll(importRegex)];
		if (verbose) loggerLoad.checkpoint('Found import matches', { count: matches.length });

		let transformed = code;

		for (const match of matches) {
			const specifier = match[1];

			if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')) {
				continue;
			}

			const resolved = resolveTsconfigPaths(specifier);
			if (resolved) {
				try {
					const parentDir = path.dirname(fileURLToPath(parentURL));
					const resolvedPath = fileURLToPath(resolved.url);
					let relativePath = path.relative(parentDir, resolvedPath).replace(/\\/g, '/');

					if (!relativePath.startsWith('.')) {
						relativePath = './' + relativePath;
					}

					const originalImport = match[0];
					const newImport = originalImport.replace(specifier, relativePath);
					transformed = transformed.replace(originalImport, newImport);
					if (verbose) loggerLoad.checkpoint('Transformed import', { from: specifier, to: relativePath });
				} catch (error) {
					loggerLoad.error('Failed to transform import', error, { specifier });
				}
			}
		}

		return transformed;
	} catch (error) {
		if (verbose) loggerLoad.checkpoint('transformImports failed', { parentURL, error: describeThrowable(error) });
		throw new Error(`Failed to transform imports: ${error.message}`, { cause: error });
	}
}

export function loadVue(url) {
	if (verbose) loggerLoad.checkpoint('loadVue', { url });

	let code;
	try {
		if (verbose) loggerLoad.checkpoint('Loading Vue source');
		code = readSource(url);
		if (verbose) loggerLoad.checkpoint('Vue source loaded', { sourceLength: code.length });
	} catch (error) {
		if (verbose) loggerLoad.checkpoint('Failed to load Vue source', { url, error: describeThrowable(error) });
		throw new Error(`Failed to load Vue source from ${url}: ${error.message}`, { cause: error });
	}

	const filename = fileURLToPath(url);

	let compiled;
	try {
		if (verbose) loggerLoad.checkpoint('Compiling Vue SFC', { filename, enableStyle: shouldEnableVueStyle() });
		compiled = compileVueSFC(code, filename, {
			enableStyle: shouldEnableVueStyle()
		});
		if (verbose) loggerLoad.checkpoint('Vue SFC compiled', { outputLength: compiled?.code?.length });
	} catch (error) {
		if (verbose) loggerLoad.checkpoint('Vue SFC compilation failed', { filename, error: describeThrowable(error) });
		throw new Error(`Failed to compile Vue SFC ${filename}: ${error.message}`, { cause: error });
	}

	let transformed;
	try {
		transformed = transformImports(compiled.code, url);
		if (verbose) loggerLoad.checkpoint('Vue imports transformed');
	} catch (error) {
		if (verbose) loggerLoad.checkpoint('Failed to transform Vue imports', { url, error: describeThrowable(error) });
		throw new Error(`Failed to transform imports in ${url}: ${error.message}`, { cause: error });
	}

	return {
		format: 'module',
		source: transformed,
		shortCircuit: true
	};
}

/**
 * Source maps of the TypeScript modules this thread has transpiled, keyed by module URL, for
 * `Callsite.resolve()` in `utils/our-callsite.ts`. A step definition's callsite is a V8 frame whose file
 * name is the module URL and whose position is in the transpiled output; the file on disk is the `.ts`
 * source, so `source-map-support` finds no map for it. With the hooks attached in-thread
 * (`module.registerHooks()`) this map is on the same global object the resolver reads; under
 * `module.register()` it lives on the hooks thread, the resolver never sees it and falls back to
 * `source-map-support`.
 */
const sourceMaps = (globalThis.__CUCUMBER_TSFLOW_SOURCE_MAPS ??= new Map());

/**
 * Transpile a `.ts`/`.tsx` module with esbuild and return it as an ES module with an inline source
 * map, keeping the map for callsite resolution. This replaces the `ts-node` service the esbuild
 * loaders used to route every TypeScript file through: ts-node contributed only its own wrapper around
 * the same `transpileCode()` call, a JSON.parse/stringify/base64 round trip to attach the map, and a
 * module-format decision that these loaders already fix at `'module'`.
 */
export function loadTypeScript(url) {
	if (verbose) loggerLoad.checkpoint('loadTypeScript', { url });
	const filename = fileURLToPath(url);
	const code = readSource(url);
	// 'both': the inline map for Node (--enable-source-maps) and the map text for our own resolver.
	const { output, sourceMap } = transpileCode(code, filename, undefined, { esbuild: { sourcemap: 'both' } });
	if (sourceMap) sourceMaps.set(url, sourceMap);
	return {
		format: 'module',
		source: output,
		shortCircuit: true
	};
}

// JSON is returned with `format: 'json'` so consumers can import it without an import attribute, as before.
export function loadJson(url) {
	if (verbose) loggerLoad.checkpoint('loadJson', { url });

	try {
		return {
			format: 'json',
			source: readSource(url),
			shortCircuit: true
		};
	} catch (error) {
		if (verbose) loggerLoad.checkpoint('loadJson failed', { url, error: describeThrowable(error) });
		throw new Error(`Failed to load JSON ${url}: ${error.message}`, { cause: error });
	}
}

// Common load handlers: assets and JSON. Returns null for anything else.
export function handleCommonFileTypes(url) {
	const ext = path.extname(url).toLowerCase();

	if (ASSET_EXTENSIONS.includes(ext)) {
		if (verbose) loggerLoad.checkpoint('Handling asset', { url, ext });
		return loadAsset(url);
	}

	if (ext === '.json') {
		if (verbose) loggerLoad.checkpoint('Handling JSON', { url });
		return loadJson(url);
	}

	return null;
}

// tsconfig `paths` mapping first, then extension probing for relative / absolute / file: specifiers.
// Returns a resolve result or null; the caller decides how to fall through.
export function resolveSpecifier(specifier, context, options = {}) {
	const { checkExtensions = true } = options;

	if (verbose) loggerResolve.checkpoint('resolveSpecifier', { specifier, checkExtensions });

	// 1. Handle TypeScript path mappings first
	try {
		const mappedResult = resolveTsconfigPaths(specifier);
		if (mappedResult) {
			const mappedUrl = mappedResult.url;
			if (checkExtensions && !path.extname(mappedUrl)) {
				const resolved = resolveWithExtensions(mappedUrl, context.parentURL);
				if (resolved) {
					if (verbose) loggerResolve.checkpoint('Resolved via tsconfig paths + extension', { specifier, resolved });
					return {
						url: resolved,
						format: 'module',
						shortCircuit: true
					};
				}
			}

			if (verbose) loggerResolve.checkpoint('Resolved via tsconfig paths', { specifier, url: mappedResult.url });
			return mappedResult;
		}
	} catch (error) {
		loggerResolve.error('tsconfig path resolution failed', error, { specifier });
	}

	// 2. Extension resolution for relative imports and file:// URLs
	if (checkExtensions && (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file://'))) {
		const hasExtension = path.extname(specifier) !== '';

		if (!hasExtension && context.parentURL) {
			try {
				const resolved = resolveWithExtensions(specifier, context.parentURL);
				if (resolved) {
					if (verbose) loggerResolve.checkpoint('Resolved with extension', { specifier, resolved });
					return {
						url: resolved,
						format: 'module',
						shortCircuit: true
					};
				}
			} catch (error) {
				loggerResolve.error('Extension resolution failed', error, { specifier });
			}
		}
	}

	if (verbose) loggerResolve.checkpoint('No resolution found', { specifier });
	return null;
}

// Common loader factory for esbuild-based loaders. The returned hooks are synchronous and work under
// both `module.registerHooks()` and `module.register()`; see the note at the top of this file.
export function createEsbuildLoader(options = {}) {
	const { loaderName = 'loader', handleVue = false } = options;

	loggerUtils.checkpoint('createEsbuildLoader', { loaderName, handleVue });

	// Create a loader-specific logger
	const loaderLogger = createLogger(loaderName);

	return {
		resolve: (specifier, context, nextResolve) => {
			if (isRequire(context)) return nextResolve(specifier, context);

			if (verbose) loaderLogger.checkpoint('resolve', { specifier, parentURL: context?.parentURL });
			const resolveStart = startTimer();

			try {
				let result = resolveSpecifier(specifier, context, { checkExtensions: true });

				if (result) {
					if (verbose) loaderLogger.checkpoint('resolve success', { specifier, url: result.url });
				} else {
					// Everything else, including explicit `.ts`/`.tsx` specifiers, is resolved by Node; `load`
					// decides what to do with the URL.
					if (verbose) loaderLogger.checkpoint('resolve delegating to nextResolve', { specifier });
					result = nextResolve(specifier, context);
				}

				// In-thread, `result` is the resolution itself: a module watch mode has decided to evaluate again
				// gets its version query here, and the import edge is recorded for selective loading. On the hooks
				// thread it is a promise (no `url`) and neither happens.
				if (result && typeof result.url === 'string') {
					const url = versionedUrl(result.url);
					if (url !== result.url) result = { ...result, url };
					recordImportEdge(context?.parentURL, url);
				}
				return result;
			} catch (error) {
				if (verbose) loaderLogger.checkpoint('resolve failed', { specifier, error: describeThrowable(error) });
				throw new Error(`Failed to resolve ${specifier}: ${error.message}`, { cause: error });
			} finally {
				recordPhase('esm:resolve', resolveStart);
			}
		},

		load: (url, context, nextLoad) => {
			if (isRequire(context)) return nextLoad(url, context);

			if (verbose) loaderLogger.checkpoint('load', { url });
			const loadStart = startTimer();

			// The extension is judged without any query: in watch mode a module being evaluated again has a
			// `?tsflow=<n>` version appended. The full `url` is what the module is loaded and mapped under.
			const file = withoutQuery(url);

			try {
				// Check common file types first
				const commonResult = handleCommonFileTypes(file);
				if (commonResult) {
					if (verbose) loaderLogger.checkpoint('load handled as common file type', { url });
					return commonResult;
				}

				// Handle Vue files if enabled
				if (handleVue && file.endsWith('.vue')) {
					if (verbose) loaderLogger.checkpoint('load handling Vue file', { url });
					try {
						const result = loadVue(url);
						recordFile('load', file, loadStart);
						if (verbose) loaderLogger.checkpoint('Vue file loaded successfully', { url });
						return result;
					} catch (error) {
						if (verbose)
							loaderLogger.checkpoint(`Failed to compile Vue SFC ${url}`, { error: describeThrowable(error) });
						throw new Error(`Failed to compile Vue SFC ${url}: ${error.message}`, { cause: error });
					}
				}

				// Handle TypeScript files
				if (file.endsWith('.ts') || file.endsWith('.tsx')) {
					if (verbose) loaderLogger.checkpoint('load handling TypeScript file', { url });
					try {
						const result = loadTypeScript(url);
						recordFile('load', file, loadStart);
						if (verbose) loaderLogger.checkpoint('TypeScript file loaded successfully', { url });
						return result;
					} catch (error) {
						if (verbose) loaderLogger.checkpoint(`esbuild failed for ${url}`, { error: describeThrowable(error) });
						throw error;
					}
				}

				if (verbose) loaderLogger.checkpoint('load delegating to nextLoad', { url });
				return nextLoad(url, context);
			} catch (error) {
				if (verbose) loaderLogger.checkpoint('load failed', { url, error: describeThrowable(error) });
				throw error;
			} finally {
				recordPhase('esm:load', loadStart);
			}
		}
	};
}
