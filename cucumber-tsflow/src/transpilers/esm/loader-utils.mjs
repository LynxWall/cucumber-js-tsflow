import { createRequire } from 'module';
import { compileVueSFC } from './vue-sfc-compiler.mjs';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';
import path from 'path';
import { createMatchPath, loadConfig } from 'tsconfig-paths';

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
	const parentPath = fileURLToPath(parentURL);
	const parentDir = path.dirname(parentPath);
	const resolvedPath = path.resolve(parentDir, specifier);

	// Try various extensions
	for (const ext of extensions) {
		const fullPath = resolvedPath + ext;
		if (existsSync(fullPath)) {
			return pathToFileURL(fullPath).href;
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
