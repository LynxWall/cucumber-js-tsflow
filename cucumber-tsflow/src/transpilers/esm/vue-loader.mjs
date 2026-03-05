/**
 * ESM loader for Vue Single File Components (.vue files)
 * [... keep existing docblock ...]
 */
import { resolveSpecifier, loadVue, handleCommonFileTypes } from './loader-utils.mjs';
import { createLogger } from '../../utils/tsflow-logger.mjs';

const logger = createLogger('vue-loader');

// Cache for the TypeScript loader
let tsLoader;

async function getTsLoader() {
	if (tsLoader) {
		logger.checkpoint('getTsLoader (cached)');
		return tsLoader;
	}

	logger.checkpoint('getTsLoader initializing');

	try {
		// Ensure ts-node respects tsconfig.json files
		process.env.TS_NODE_FILES = process.env.TS_NODE_FILES || 'true';

		logger.checkpoint('Importing ts-node-maintained/esm');
		const tsNodeEsm = await import('ts-node-maintained/esm');
		tsLoader = tsNodeEsm;

		logger.checkpoint('ts-node ESM loader cached');
		return tsLoader;
	} catch (error) {
		logger.error('Failed to load ts-node ESM loader', error);
		throw new Error(`Failed to load ts-node ESM loader: ${error.message}`, { cause: error });
	}
}

export async function load(url, context, nextLoad) {
	logger.checkpoint('load', { url });

	// Check common file types first
	const commonResult = await handleCommonFileTypes(url, context, nextLoad);
	if (commonResult) {
		logger.checkpoint('load handled as common file type', { url });
		return commonResult;
	}

	// Only process .vue files directly
	if (url.endsWith('.vue')) {
		logger.checkpoint('load handling Vue file', { url });
		try {
			const result = await loadVue(url, context, nextLoad);
			logger.checkpoint('Vue file loaded successfully', { url });
			return result;
		} catch (error) {
			logger.error('Failed to compile Vue SFC', error, { url });
			throw new Error(`Failed to compile Vue SFC ${url}: ${error.message}`, { cause: error });
		}
	}

	// For TypeScript files, delegate to ts-node
	if (url.endsWith('.ts') || url.endsWith('.tsx')) {
		logger.checkpoint('load delegating to ts-node', { url });
		try {
			const tsNode = await getTsLoader();
			const result = await tsNode.load(url, context, nextLoad);
			logger.checkpoint('ts-node load success', { url });
			return result;
		} catch (error) {
			logger.error('ts-node failed', error, { url });
			throw new Error(`ts-node failed for ${url}: ${error.message}`, { cause: error });
		}
	}

	// For everything else, use the default loader
	logger.checkpoint('load delegating to nextLoad', { url });
	return nextLoad(url, context);
}

export async function resolve(specifier, context, nextResolve) {
	logger.checkpoint('resolve', { specifier, parentURL: context.parentURL });

	// Try common resolution logic
	const resolved = await resolveSpecifier(specifier, context, {
		checkExtensions: true,
		handleTsFiles: false,
		nextResolve
	});

	if (resolved) {
		logger.checkpoint('resolve success', { specifier, url: resolved.url });
		return resolved;
	}

	logger.checkpoint('resolve delegating to nextResolve', { specifier });
	return nextResolve(specifier, context);
}
