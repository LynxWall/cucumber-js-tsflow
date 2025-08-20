import { fileURLToPath } from 'url';
import { compileVueSFC } from './vue-sfc-compiler.mjs';
import path from 'path';
import {
	initializeJsdom,
	ASSET_EXTENSIONS,
	resolveWithExtensions,
	resolveTsconfigPaths,
	loadAsset,
	loadVue
} from './loader-utils.mjs';
import { createEsmHooks } from './tsnode-service.mjs';

initializeJsdom();

// Cache for the TypeScript loader
let esmHooks;

async function getEsmHooks() {
	if (!esmHooks) {
		try {
			// Use an absolute path to the transpiler
			const transpilerPath = '@lynxwall/cucumber-tsflow/lib/transpilers/esm/esbuild-transpiler-cjs';
			esmHooks = createEsmHooks(transpilerPath);
		} catch (error) {
			console.error('>>> vue-loader: Failed to load ts-node ESM loader:', error);
			throw error;
		}
	}
	return esmHooks;
}

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
			const tsNodeHooks = await getEsmHooks();
			return tsNodeHooks.resolve(specifier, context, nextResolve);
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

export async function load(url, context, nextLoad) {
	// Handle asset files that Vue compiler turns into imports
	const ext = path.extname(url).toLowerCase();
	if (ASSET_EXTENSIONS.includes(ext)) {
		return loadAsset(url);
	}

	// Handle Vue files
	if (url.endsWith('.vue')) {
		try {
			return loadVue(url, context, nextLoad);
		} catch (error) {
			console.error(`>>> esvue-loader: Failed to compile Vue SFC ${url}:`, error);
			throw new Error(`Failed to compile Vue SFC ${url}: ${error.message}`);
		}
	}

	// For TypeScript files, delegate to ts-node
	if (url.endsWith('.ts') || url.endsWith('.tsx')) {
		try {
			const tsNodeHooks = await getEsmHooks();
			return tsNodeHooks.load(url, context, nextLoad);
		} catch (error) {
			console.error(`>>> vue-loader: ts-node failed for ${url}:`, error);
			throw error;
		}
	}

	// For everything else, use the default loader
	// This includes: .js, .mjs, .json, node: URLs, etc.
	return nextLoad(url, context);
}

// Export remaining hooks
export const getFormat = async (...args) => (await getEsmHooks()).getFormat(...args);
export const transformSource = async (...args) => (await getEsmHooks()).transformSource(...args);
