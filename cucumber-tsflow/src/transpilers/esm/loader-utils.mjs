import { createRequire } from 'module';
import { compileVueSFC } from './vue-sfc-compiler.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';
import path from 'path';
import { createMatchPath, loadConfig } from 'tsconfig-paths';
import { createEsmHooks } from './tsnode-service.mjs';

// Initialize jsdom-global (shared by both loaders)
export function initializeJsdom() {
	const require = createRequire(import.meta.url);
	require('jsdom-global')();
	global.SVGElement = global.window.SVGElement;
}

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

	try {
		const configLoaderResult = loadConfig(process.cwd());
		if (configLoaderResult.resultType === 'success') {
			matchPath = createMatchPath(
				configLoaderResult.absoluteBaseUrl,
				configLoaderResult.paths,
				configLoaderResult.mainFields,
				configLoaderResult.addMatchAll
			);
		} else {
			console.warn('>>> loader: no tsconfig paths found');
		}
	} catch (error) {
		console.error('>>> loader: failed to load tsconfig paths:', error);
	}

	return matchPath;
}

// Extension resolution helper
export async function resolveWithExtensions(specifier, parentURL, extensions = CODE_EXTENSIONS) {
	let resolvedPath;

	if (specifier.startsWith('file://')) {
		// Handle file:// URLs
		resolvedPath = fileURLToPath(specifier);
	} else {
		// Handle relative paths
		const parentPath = fileURLToPath(parentURL);
		const parentDir = path.dirname(parentPath);
		resolvedPath = path.resolve(parentDir, specifier);
	}
	// Try various extensions
	for (const ext of extensions) {
		const fullPath = resolvedPath + ext;

		if (existsSync(fullPath)) {
			const result = pathToFileURL(fullPath).href;
			return result;
		}
	}

	// Try index files
	for (const ext of extensions) {
		const indexPath = path.join(resolvedPath, 'index' + ext);
		if (existsSync(indexPath)) {
			return pathToFileURL(indexPath).href;
		}
	}

	return null;
}

// TSConfig path mapping resolver
export function resolveTsconfigPaths(specifier) {
	const matchPath = initializeTsconfigPaths();

	if (matchPath && !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('file:')) {
		const mapped = matchPath(specifier);

		if (mapped) {
			return {
				url: pathToFileURL(mapped).href,
				shortCircuit: true
			};
		}
	}

	return null;
}

// Asset loader helper
export function loadAsset(url) {
	const filePath = fileURLToPath(url);
	return {
		format: 'module',
		source: `export default ${JSON.stringify(filePath)};`,
		shortCircuit: true
	};
}

// Vue style configuration helper
export function shouldEnableVueStyle() {
	// Check if styles should be enabled (from environment or config)
	// Vue styles are disabled by default. However, user could enable them when importing from compiled libraries
	return (
		global.enableVueStyle === true ||
		process.env.CUCUMBER_ENABLE_VUE_STYLE === 'true' ||
		process.env.enableVueStyle === 'true'
	);
}

export async function loadVue(url, context, nextLoad) {
	const { source } = await nextLoad(url, { ...context, format: 'module' });
	const code = source.toString();
	const filename = fileURLToPath(url);

	const compiled = compileVueSFC(code, filename, {
		enableStyle: shouldEnableVueStyle()
	});

	return {
		format: 'module',
		source: compiled.code,
		shortCircuit: true
	};
}

/**
 * Resolves module specifiers with support for TypeScript paths, extensions, and more
 * @param {string} specifier - The module specifier to resolve
 * @param {object} context - The loader context
 * @param {object} options - Resolution options
 * @param {string} options.logPrefix - Prefix for log messages
 * @param {boolean} options.checkExtensions - Whether to try adding extensions
 * @param {boolean} options.handleTsFiles - Whether to delegate .ts files to ts-node
 * @param {object} options.tsNodeHooks - The ts-node hooks (if handleTsFiles is true)
 * @param {function} options.nextResolve - The next resolver in the chain
 * @returns {Promise<object|null>} The resolution result or null
 */
export async function resolveSpecifier(specifier, context, options = {}) {
	const { checkExtensions = true, handleTsFiles = false, tsNodeHooks = null, nextResolve } = options;

	// 1. Handle TypeScript path mappings first
	const mappedResult = resolveTsconfigPaths(specifier);
	if (mappedResult) {
		// Check if the mapped result needs extension resolution
		const mappedUrl = mappedResult.url;
		if (checkExtensions && !path.extname(mappedUrl)) {
			// Try to resolve with extensions
			const resolved = await resolveWithExtensions(mappedUrl, context.parentURL);
			if (resolved) {
				return { url: resolved, shortCircuit: true };
			}
		}

		return mappedResult;
	}

	// 2. Handle TypeScript files if requested
	if (handleTsFiles && tsNodeHooks && (specifier.endsWith('.ts') || specifier.endsWith('.tsx'))) {
		try {
			return await tsNodeHooks.resolve(specifier, context, nextResolve);
		} catch (error) {
			// Fall through to extension resolution
		}
	}

	// 3. Extension resolution for relative imports and file:// URLs
	if (checkExtensions && (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file://'))) {
		const hasExtension = path.extname(specifier) !== '';

		if (!hasExtension && context.parentURL) {
			const resolved = await resolveWithExtensions(specifier, context.parentURL);
			if (resolved) {
				return { url: resolved, shortCircuit: true };
			}
		}
	}

	// 4. No resolution found
	return null;
}

// Cache for different ESM hooks by transpiler path
const esmHooksCache = new Map();

export async function getEsmHooks(transpilerPath, loaderName = 'loader') {
	if (esmHooksCache.has(transpilerPath)) {
		return esmHooksCache.get(transpilerPath);
	}

	try {
		const hooks = await createEsmHooks(transpilerPath);
		esmHooksCache.set(transpilerPath, hooks);
		return hooks;
	} catch (error) {
		console.error(`>>> ${loaderName}: Failed to load ESM hooks with transpiler ${transpilerPath}:`, error);
		throw error;
	}
}

// Helper to create hook exports
export function createHookExports(getHooksFn) {
	return {
		getFormat: async (...args) => (await getHooksFn()).getFormat(...args),
		transformSource: async (...args) => (await getHooksFn()).transformSource(...args)
	};
}

// Common loader factory for esbuild-based loaders
export function createEsbuildLoader(options = {}) {
	const {
		loaderName = 'loader',
		handleVue = false,
		transpilerPath = '@lynxwall/cucumber-tsflow/lib/transpilers/esm/esbuild-transpiler-cjs'
	} = options;

	const getLocalEsmHooks = () => getEsmHooks(transpilerPath, loaderName);

	return {
		resolve: async (specifier, context, nextResolve) => {
			const resolved = await resolveSpecifier(specifier, context, {
				checkExtensions: true,
				handleTsFiles: true,
				tsNodeHooks: await getLocalEsmHooks(),
				nextResolve
			});

			if (resolved) {
				return resolved;
			}

			return nextResolve(specifier, context);
		},

		load: async (url, context, nextLoad) => {
			// Handle asset files
			const ext = path.extname(url).toLowerCase();
			if (ASSET_EXTENSIONS.includes(ext)) {
				return loadAsset(url);
			}

			// Handle Vue files if enabled
			if (handleVue && url.endsWith('.vue')) {
				try {
					return loadVue(url, context, nextLoad);
				} catch (error) {
					console.error(`>>> ${loaderName}: Failed to compile Vue SFC ${url}:`, error);
					throw new Error(`Failed to compile Vue SFC ${url}: ${error.message}`);
				}
			}

			// Handle TypeScript files
			if (url.endsWith('.ts') || url.endsWith('.tsx')) {
				try {
					const tsNodeHooks = await getLocalEsmHooks();
					return tsNodeHooks.load(url, context, nextLoad);
				} catch (error) {
					console.error(`>>> ${loaderName}: ts-node failed for ${url}:`, error);
					throw error;
				}
			}

			return nextLoad(url, context);
		},

		...createHookExports(getLocalEsmHooks)
	};
}
