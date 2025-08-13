/**
 * ESM loader for Vue Single File Components (.vue files)
 *
 * This loader enables importing and testing Vue SFC components in Node.js ESM environments.
 * It provides feature parity with the CJS vue-loader but uses Node.js ESM loader hooks.
 *
 * Key features:
 * - Compiles Vue SFC components (template, script, and optionally styles)
 * - Handles TypeScript in Vue components via ts-node delegation
 * - Supports extensionless imports (e.g., import Component from './Component')
 * - Handles asset imports (images, fonts, etc.)
 * - Integrates with tsconfig path mappings
 * - Optional style processing controlled by global.enableVueStyle
 *
 * Differences from CJS version:
 * - Uses ESM loader hooks (resolve/load) instead of require.extensions
 * - Delegates TypeScript handling to ts-node/esm instead of inline transpilation
 * - Sets TS_NODE_FILES=true to ensure ts-node respects tsconfig.json includes
 *   (needed for type definition files like Vue shims)
 *
 * Usage:
 * 1. Or configure in cucumber.json:
 *    {
 *      "default": {
 *        "transpiler": ["tsvueesm"]
 *      }
 *    }
 *
 * 2. Register this loader when running tests:
 *    node --loader=@lynxwall/cucumber-tsflow/lib/transpilers/esm/vue-loader.mjs
 *
 * 3. To enable style processing:
 *    - Set global.enableVueStyle = true in your test setup
 *    - Or set environment variable: CUCUMBER_ENABLE_VUE_STYLE=true
 *
 * Note: Style preprocessing (SCSS, Less, etc.) requires the corresponding
 * preprocessor packages to be installed. Missing preprocessors will be skipped
 * with a warning rather than failing the compilation.
 */
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { compileVueSFC } from './vue-sfc-compiler.mjs';
import path from 'path';
import { createMatchPath, loadConfig } from 'tsconfig-paths';
import { existsSync } from 'fs';

// Initialize jsdom-global for the loader context
const require = createRequire(import.meta.url);
require('jsdom-global')();

// Set SVGElement as in CJS version
global.SVGElement = global.window.SVGElement;

// Initialize tsconfig-paths
let matchPath;
function initializeTsconfigPaths() {
	if (matchPath) return;

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
			console.warn('>>> vue-loader: no tsconfig paths found');
		}
	} catch (error) {
		console.error('>>> vue-loader: failed to load tsconfig paths:', error);
	}
}

initializeTsconfigPaths();

// Cache for the TypeScript loader
let tsLoader;

async function getTsLoader() {
	if (!tsLoader) {
		try {
			// Ensure ts-node respects tsconfig.json files
			// This is crucial for picking up:
			// - Type definition files (d.ts)
			// - Include/exclude patterns
			// - Custom type roots (e.g., for Vue shims)
			// Without this, ts-node might ignore the tsconfig.json includes			process.env.TS_NODE_FILES = process.env.TS_NODE_FILES || 'true';

			// Import ts-node's ESM loader
			const tsNodeEsm = await import('ts-node/esm');
			tsLoader = tsNodeEsm;
		} catch (error) {
			console.error('>>> vue-loader: Failed to load ts-node ESM loader:', error);
			throw error;
		}
	}
	return tsLoader;
}

export async function load(url, context, nextLoad) {
	// Handle asset files that Vue compiler turns into imports
	const assetExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
	const ext = path.extname(url).toLowerCase();

	if (assetExtensions.includes(ext)) {
		// In CJS, the assets plugin would register these and potentially transform them
		// For ESM testing, we'll return the file path as a module
		// This matches what a bundler's asset plugin would do
		const filePath = fileURLToPath(url);

		// You could also implement asset transformation here if needed
		// For example, copying to a dist folder, generating hashes, etc.
		return {
			format: 'module',
			source: `export default ${JSON.stringify(filePath)};`,
			shortCircuit: true
		};
	}

	// Only process .vue files directly
	if (url.endsWith('.vue')) {
		try {
			const { source } = await nextLoad(url, { ...context, format: 'module' });
			const code = source.toString();
			const filename = fileURLToPath(url);

			// Check if styles should be enabled (from environment or config)
			// Vue styles are disabled by default. However, user could enable them when importing from compiled libraries
			const enableVueStyle =
				global.enableVueStyle === true ||
				process.env.CUCUMBER_ENABLE_VUE_STYLE === 'true' ||
				process.env.enableVueStyle === 'true';

			const compiled = compileVueSFC(code, filename, { enableStyle: enableVueStyle });

			return {
				format: 'module',
				source: compiled.code,
				shortCircuit: true
			};
		} catch (error) {
			console.error(`>>> vue-loader: Failed to compile Vue SFC ${url}:`, error);
			throw new Error(`Failed to compile Vue SFC ${url}: ${error.message}`);
		}
	}

	// For TypeScript files, delegate to ts-node
	if (url.endsWith('.ts') || url.endsWith('.tsx')) {
		try {
			const tsNode = await getTsLoader();
			return tsNode.load(url, context, nextLoad);
		} catch (error) {
			console.error(`>>> vue-loader: ts-node failed for ${url}:`, error);
			throw error;
		}
	}

	// For everything else, use the default loader
	// This includes: .js, .mjs, .json, node: URLs, etc.
	return nextLoad(url, context);
}

// Optional: export resolve hook if needed
export async function resolve(specifier, context, nextResolve) {
	// Extension resolution for relative imports
	// This allows importing without file extensions:
	//   import Component from './Component'  -> resolves to ./Component.vue
	//   import helper from './helper'        -> resolves to ./helper.ts
	// Tries extensions in order: .vue, .ts, .tsx, .js, .jsx, .mjs, .cjs, .json
	if (specifier.startsWith('.') || specifier.startsWith('/')) {
		const hasExtension = path.extname(specifier) !== '';

		if (!hasExtension && context.parentURL) {
			const parentPath = fileURLToPath(context.parentURL);
			const parentDir = path.dirname(parentPath);
			const resolvedPath = path.resolve(parentDir, specifier);

			// Try various extensions
			const extensions = ['.vue', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
			for (const ext of extensions) {
				const fullPath = resolvedPath + ext;
				if (existsSync(fullPath)) {
					return {
						url: pathToFileURL(fullPath).href,
						shortCircuit: true
					};
				}
			}

			// Try index files
			for (const ext of extensions) {
				const indexPath = path.join(resolvedPath, 'index' + ext);
				if (existsSync(indexPath)) {
					return {
						url: pathToFileURL(indexPath).href,
						shortCircuit: true
					};
				}
			}
		}
	}
	// TypeScript file handling - delegate to ts-node's resolver
	// This ensures TypeScript's module resolution rules are followed
	if (specifier.endsWith('.ts') || specifier.endsWith('.tsx')) {
		try {
			const tsNode = await getTsLoader();
			if (tsNode.resolve) {
				return tsNode.resolve(specifier, context, nextResolve);
			}
		} catch (error) {
			// Fall through to default resolver
		}
	}

	// Initialize on first use
	if (!matchPath) {
		initializeTsconfigPaths();
	}

	// tsconfig path mapping support
	// Resolves imports like '@/components/Button' based on tsconfig paths
	if (matchPath && !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('file:')) {
		const mapped = matchPath(specifier);
		if (mapped) {
			return nextResolve(pathToFileURL(mapped).href, context);
		}
	}

	return nextResolve(specifier, context);
}
