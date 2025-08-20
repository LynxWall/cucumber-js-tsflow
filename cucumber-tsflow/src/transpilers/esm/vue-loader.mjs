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
import path from 'path';
import {
	initializeJsdom,
	ASSET_EXTENSIONS,
	resolveWithExtensions,
	resolveTsconfigPaths,
	loadAsset,
	loadVue
} from './loader-utils.mjs';

initializeJsdom();

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
	const ext = path.extname(url).toLowerCase();
	if (ASSET_EXTENSIONS.includes(ext)) {
		return loadAsset(url);
	}

	// Only process .vue files directly
	if (url.endsWith('.vue')) {
		try {
			return loadVue(url, context, nextLoad);
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
			const resolved = await resolveWithExtensions(specifier, context.parentURL);
			if (resolved) {
				return { url: resolved, shortCircuit: true };
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
	// TSConfig path mapping resolver
	const mappedResult = resolveTsconfigPaths(specifier);
	if (mappedResult) {
		return mappedResult;
	}

	return nextResolve(specifier, context);
}
