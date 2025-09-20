import { pathToFileURL } from 'url';
import { createRequire } from 'node:module';
import { resolveSpecifier } from './loader-utils.mjs';
import { loadConfig } from 'tsconfig-paths';
import path from 'path';

const require = createRequire(import.meta.url);

// Load tsconfig to get paths
const configLoaderResult = loadConfig(process.cwd());
let paths = {};
let baseUrl = './';

if (configLoaderResult.resultType === 'success') {
	paths = configLoaderResult.paths || {};
	baseUrl = configLoaderResult.baseUrl || './';
}

// Create ts-node service with our configuration
const tsNode = require('ts-node-maintained');

const service = tsNode.create({
	esm: true,
	experimentalSpecifierResolution: 'node',
	files: true,
	transpileOnly: true,
	compilerOptions: {
		experimentalDecorators: process.env.CUCUMBER_EXPERIMENTAL_DECORATORS === 'true',
		module: 'ESNext',
		target: 'ES2022',
		// Add path mapping to ts-node's compiler options
		baseUrl: baseUrl,
		paths: paths
	}
});

// Create ESM hooks from the service
const esmHooks = tsNode.createEsmHooks(service);

export async function resolve(specifier, context, nextResolve) {
	// Try common resolution logic (includes path mapping + extension resolution)
	const resolved = await resolveSpecifier(specifier, context, {
		checkExtensions: true,
		handleTsFiles: true,
		tsNodeHooks: esmHooks,
		nextResolve
	});

	if (resolved) {
		return resolved;
	}

	// Fall back to ts-node's resolver
	return esmHooks.resolve(specifier, context, nextResolve);
}

export const load = async (url, context, nextLoad) => {
	// Only intercept TypeScript files for path rewriting
	if (url.endsWith('.ts') || url.endsWith('.tsx')) {
		// First, let ts-node load the file
		const result = await esmHooks.load(url, context, nextLoad);

		// If we have path mappings, check if we need to rewrite the source
		if (configLoaderResult.resultType === 'success' && configLoaderResult.paths) {
			let code = result.source.toString();
			let modified = false;

			for (const [pattern, replacements] of Object.entries(configLoaderResult.paths)) {
				// Convert TS path pattern to regex: @fixtures/* -> @fixtures/
				const searchPattern = pattern.replace('/*', '/');
				const searchRegex = new RegExp(`(from\\s+['"])${searchPattern}([^'"]+)(['"])`, 'g');

				if (searchRegex.test(code)) {
					// Get the replacement path (use first one if multiple)
					const replacementPath = replacements[0].replace('/*', '');

					code = code.replace(searchRegex, (match, prefix, importPath, suffix) => {
						// Create the full path
						const fullPath = path.join(configLoaderResult.absoluteBaseUrl, replacementPath, importPath);
						// Convert to file:// URL for ESM
						const fileUrl = pathToFileURL(fullPath).href;
						return `${prefix}${fileUrl}${suffix}`;
					});

					modified = true;
				}
			}

			if (modified) {
				// Return the modified result
				return {
					...result,
					source: code
				};
			}
		}

		// Return the unmodified result from ts-node
		return result;
	}

	// For non-TypeScript files, let ts-node handle it
	return esmHooks.load(url, context, nextLoad);
};

export const getFormat = esmHooks.getFormat;
export const transformSource = esmHooks.transformSource;
