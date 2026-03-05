import { compileVueSFC } from './vue-sfc-compiler.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';
import path from 'path';
import { createMatchPath, loadConfig } from 'tsconfig-paths';
import { createEsmHooks } from './tsnode-service.mjs';
import { createLogger } from '../../utils/tsflow-logger.mjs';

// Create loggers for different concerns
const loggerUtils = createLogger('loader-utils');
const loggerResolve = createLogger('resolve');
const loggerLoad = createLogger('load');

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

// Extension resolution helper
export async function resolveWithExtensions(specifier, parentURL, extensions = CODE_EXTENSIONS) {
	loggerResolve.checkpoint('resolveWithExtensions', { specifier, parentURL });

	let resolvedPath;

	try {
		if (specifier.startsWith('file://')) {
			resolvedPath = fileURLToPath(specifier);
		} else {
			const parentPath = fileURLToPath(parentURL);
			const parentDir = path.dirname(parentPath);
			resolvedPath = path.resolve(parentDir, specifier);
		}
		loggerResolve.checkpoint('Resolved base path', { resolvedPath });
	} catch (error) {
		loggerResolve.error('Failed to resolve base path', error, { specifier, parentURL });
		return null;
	}

	// Try various extensions
	for (const ext of extensions) {
		const fullPath = resolvedPath + ext;
		if (existsSync(fullPath)) {
			const result = pathToFileURL(fullPath).href;
			loggerResolve.checkpoint('Resolved with extension', { ext, result });
			return result;
		}
	}

	// Try index files
	for (const ext of extensions) {
		const indexPath = path.join(resolvedPath, 'index' + ext);
		if (existsSync(indexPath)) {
			const result = pathToFileURL(indexPath).href;
			loggerResolve.checkpoint('Resolved as index file', { ext, result });
			return result;
		}
	}

	loggerResolve.checkpoint('No resolution found', { specifier });
	return null;
}

const pathResolutionCache = new Map();

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

	loggerResolve.checkpoint('resolveTsconfigPaths', { specifier });

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
			loggerResolve.checkpoint('tsconfig path matched', { specifier, mapped });
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
					loggerResolve.checkpoint('tsconfig path matched with extension', {
						specifier,
						ext,
						mapped: mappedWithExt
					});
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

// Asset loader helper
export function loadAsset(url) {
	loggerLoad.checkpoint('loadAsset', { url });
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
	loggerUtils.checkpoint('shouldEnableVueStyle', { enabled });
	return enabled;
}

async function transformImports(code, parentURL) {
	loggerLoad.checkpoint('transformImports', { parentURL, codeLength: code?.length });

	try {
		const importRegex =
			/(?:import|export)\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+|type\s+\{[^}]*\}|type\s+\w+)\s+from\s+)?['"]([^'"]+)['"]/g;

		const matches = [...code.matchAll(importRegex)];
		loggerLoad.checkpoint('Found import matches', { count: matches.length });

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
					loggerLoad.checkpoint('Transformed import', { from: specifier, to: relativePath });
				} catch (error) {
					loggerLoad.error('Failed to transform import', error, { specifier });
				}
			}
		}

		return transformed;
	} catch (error) {
		loggerLoad.error('transformImports failed', error, { parentURL });
		throw new Error(`Failed to transform imports: ${error.message}`, { cause: error });
	}
}

export async function loadVue(url, context, nextLoad) {
	loggerLoad.checkpoint('loadVue', { url });

	let source;
	try {
		loggerLoad.checkpoint('Loading Vue source');
		const result = await nextLoad(url, { ...context, format: 'module' });
		source = result.source;
		loggerLoad.checkpoint('Vue source loaded', { sourceLength: source?.toString()?.length });
	} catch (error) {
		loggerLoad.error('Failed to load Vue source', error, { url });
		throw new Error(`Failed to load Vue source from ${url}: ${error.message}`, { cause: error });
	}

	const code = source.toString();
	const filename = fileURLToPath(url);

	let compiled;
	try {
		loggerLoad.checkpoint('Compiling Vue SFC', { filename, enableStyle: shouldEnableVueStyle() });
		compiled = compileVueSFC(code, filename, {
			enableStyle: shouldEnableVueStyle()
		});
		loggerLoad.checkpoint('Vue SFC compiled', { outputLength: compiled?.code?.length });
	} catch (error) {
		loggerLoad.error('Vue SFC compilation failed', error, { filename });
		throw new Error(`Failed to compile Vue SFC ${filename}: ${error.message}`, { cause: error });
	}

	let transformed;
	try {
		transformed = await transformImports(compiled.code, url);
		loggerLoad.checkpoint('Vue imports transformed');
	} catch (error) {
		loggerLoad.error('Failed to transform Vue imports', error, { url });
		throw new Error(`Failed to transform imports in ${url}: ${error.message}`, { cause: error });
	}

	return {
		format: 'module',
		source: transformed,
		shortCircuit: true
	};
}

// Common load handlers
export async function loadJson(url, context, nextLoad) {
	loggerLoad.checkpoint('loadJson', { url });

	try {
		const result = await nextLoad(url, {
			...context,
			format: 'json',
			importAttributes: { type: 'json' }
		});

		return {
			...result,
			format: 'json',
			shortCircuit: true
		};
	} catch (error) {
		loggerLoad.error('loadJson failed', error, { url });
		throw new Error(`Failed to load JSON ${url}: ${error.message}`, { cause: error });
	}
}

export function handleCommonFileTypes(url, context, nextLoad, loaderName = 'loader') {
	const ext = path.extname(url).toLowerCase();

	if (ASSET_EXTENSIONS.includes(ext)) {
		loggerLoad.checkpoint('Handling asset', { url, ext });
		return loadAsset(url);
	}

	if (url.endsWith('.json')) {
		loggerLoad.checkpoint('Handling JSON', { url });
		try {
			return loadJson(url, context, nextLoad);
		} catch (error) {
			loggerLoad.error(`Failed to compile ${url}`, error);
			throw new Error(`Failed to compile ${url}: ${error.message}`, { cause: error });
		}
	}

	return null;
}

export async function resolveSpecifier(specifier, context, options = {}) {
	const { checkExtensions = true, handleTsFiles = false, tsNodeHooks = null, nextResolve } = options;

	loggerResolve.checkpoint('resolveSpecifier', { specifier, checkExtensions, handleTsFiles });

	// 1. Handle TypeScript path mappings first
	try {
		const mappedResult = resolveTsconfigPaths(specifier);
		if (mappedResult) {
			const mappedUrl = mappedResult.url;
			if (checkExtensions && !path.extname(mappedUrl)) {
				const resolved = await resolveWithExtensions(mappedUrl, context.parentURL);
				if (resolved) {
					loggerResolve.checkpoint('Resolved via tsconfig paths + extension', { specifier, resolved });
					return {
						url: resolved,
						format: 'module',
						shortCircuit: true
					};
				}
			}

			loggerResolve.checkpoint('Resolved via tsconfig paths', { specifier, url: mappedResult.url });
			return mappedResult;
		}
	} catch (error) {
		loggerResolve.error('tsconfig path resolution failed', error, { specifier });
	}

	// 2. Handle TypeScript files if requested
	if (handleTsFiles && tsNodeHooks && (specifier.endsWith('.ts') || specifier.endsWith('.tsx'))) {
		try {
			loggerResolve.checkpoint('Delegating .ts to ts-node hooks', { specifier });
			const resolved = await tsNodeHooks.resolve(specifier, context, nextResolve);
			return { ...resolved, format: 'module' };
		} catch (error) {
			loggerResolve.checkpoint('ts-node resolution failed, falling through', { specifier, error: error.message });
		}
	}

	// 3. Extension resolution for relative imports and file:// URLs
	if (checkExtensions && (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file://'))) {
		const hasExtension = path.extname(specifier) !== '';

		if (!hasExtension && context.parentURL) {
			try {
				const resolved = await resolveWithExtensions(specifier, context.parentURL);
				if (resolved) {
					loggerResolve.checkpoint('Resolved with extension', { specifier, resolved });
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

	loggerResolve.checkpoint('No resolution found', { specifier });
	return null;
}

// Cache for different ESM hooks by transpiler path
const esmHooksCache = new Map();

export async function getEsmHooks(transpilerPath, loaderName = 'loader') {
	loggerUtils.checkpoint('getEsmHooks', { transpilerPath, loaderName });

	if (esmHooksCache.has(transpilerPath)) {
		loggerUtils.checkpoint('Returning cached ESM hooks', { transpilerPath });
		return esmHooksCache.get(transpilerPath);
	}

	try {
		loggerUtils.checkpoint('Creating ESM hooks', { transpilerPath });
		const hooks = await createEsmHooks(transpilerPath);
		esmHooksCache.set(transpilerPath, hooks);
		loggerUtils.checkpoint('ESM hooks created and cached');
		return hooks;
	} catch (error) {
		loggerUtils.error(`Failed to load ESM hooks with transpiler ${transpilerPath}`, error);
		throw new Error(`Failed to load ESM hooks: ${error.message}`, { cause: error });
	}
}

// Helper to create hook exports
export function createHookExports(getHooksFn) {
	return {
		getFormat: async (...args) => {
			loggerUtils.checkpoint('getFormat called', { url: args[0] });
			return (await getHooksFn()).getFormat(...args);
		},
		transformSource: async (...args) => {
			loggerUtils.checkpoint('transformSource called', { url: args[1]?.url });
			return (await getHooksFn()).transformSource(...args);
		}
	};
}

// Common loader factory for esbuild-based loaders
export function createEsbuildLoader(options = {}) {
	const {
		loaderName = 'loader',
		handleVue = false,
		transpilerPath = '@lynxwall/cucumber-tsflow/lib/transpilers/esm/esbuild-transpiler-cjs'
	} = options;

	loggerUtils.checkpoint('createEsbuildLoader', { loaderName, handleVue, transpilerPath });

	// Create a loader-specific logger
	const loaderLogger = createLogger(loaderName);

	const getLocalEsmHooks = () => getEsmHooks(transpilerPath, loaderName);

	return {
		resolve: async (specifier, context, nextResolve) => {
			loaderLogger.checkpoint('resolve', { specifier, parentURL: context?.parentURL });

			try {
				const resolved = await resolveSpecifier(specifier, context, {
					checkExtensions: true,
					handleTsFiles: true,
					tsNodeHooks: await getLocalEsmHooks(),
					nextResolve
				});

				if (resolved) {
					loaderLogger.checkpoint('resolve success', { specifier, url: resolved.url });
					return resolved;
				}

				loaderLogger.checkpoint('resolve delegating to nextResolve', { specifier });
				return nextResolve(specifier, context);
			} catch (error) {
				loaderLogger.error('resolve failed', error, { specifier });
				throw new Error(`Failed to resolve ${specifier}: ${error.message}`, { cause: error });
			}
		},

		load: async (url, context, nextLoad) => {
			loaderLogger.checkpoint('load', { url });

			try {
				// Check common file types first
				const commonResult = await handleCommonFileTypes(url, context, nextLoad, loaderName);
				if (commonResult) {
					loaderLogger.checkpoint('load handled as common file type', { url });
					return commonResult;
				}

				// Handle Vue files if enabled
				if (handleVue && url.endsWith('.vue')) {
					loaderLogger.checkpoint('load handling Vue file', { url });
					try {
						const result = await loadVue(url, context, nextLoad);
						loaderLogger.checkpoint('Vue file loaded successfully', { url });
						return result;
					} catch (error) {
						loaderLogger.error(`Failed to compile Vue SFC ${url}`, error);
						throw new Error(`Failed to compile Vue SFC ${url}: ${error.message}`, { cause: error });
					}
				}

				// Handle TypeScript files
				if (url.endsWith('.ts') || url.endsWith('.tsx')) {
					loaderLogger.checkpoint('load handling TypeScript file', { url });
					try {
						const tsNodeHooks = await getLocalEsmHooks();
						const result = await tsNodeHooks.load(url, context, nextLoad);
						loaderLogger.checkpoint('TypeScript file loaded successfully', { url });
						return result;
					} catch (error) {
						loaderLogger.error(`ts-node failed for ${url}`, error);
						throw error;
					}
				}

				loaderLogger.checkpoint('load delegating to nextLoad', { url });
				return nextLoad(url, context);
			} catch (error) {
				loaderLogger.error('load failed', error, { url });
				throw error;
			}
		},

		...createHookExports(getLocalEsmHooks)
	};
}
