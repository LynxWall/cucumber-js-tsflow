/**
 * ESM loader for Vue Single File Components (.vue files)
 * [... keep existing docblock ...]
 */
import { resolveSpecifier, loadVue, handleCommonFileTypes } from './loader-utils.mjs';
import { createLogger, isVerbose } from '../../utils/tsflow-logger.mjs';
import { startTimer, recordPhase, recordFile } from '../../utils/tsflow-timing.mjs';

// TSFLOW_TIMING support: receives the timing MessagePort passed via module.register() data
export { initialize } from '../../utils/tsflow-timing.mjs';

// This loader delegates TypeScript to `ts-node-maintained/esm`, whose hooks are asynchronous, so it is
// always registered with module.register() and runs on the loader hooks thread.

const logger = createLogger('vue-loader');

// Per-file checkpoints in the resolve/load hot paths are guarded so their detail
// objects and template strings are never built when verbose logging is off.
const verbose = isVerbose();

// Cache for the TypeScript loader
let tsLoader;

async function getTsLoader() {
	if (tsLoader) {
		if (verbose) logger.checkpoint('getTsLoader (cached)');
		return tsLoader;
	}

	logger.checkpoint('getTsLoader initializing');

	try {
		logger.checkpoint('Importing ts-node-maintained/esm');
		const initStart = startTimer();
		const tsNodeEsm = await import('ts-node-maintained/esm');
		recordPhase('esm:hooks-init', initStart);
		tsLoader = tsNodeEsm;

		logger.checkpoint('ts-node ESM loader cached');
		return tsLoader;
	} catch (error) {
		logger.error('Failed to load ts-node ESM loader', error);
		throw new Error(`Failed to load ts-node ESM loader: ${error.message}`, { cause: error });
	}
}

export async function load(url, context, nextLoad) {
	if (verbose) logger.checkpoint('load', { url });
	const loadStart = startTimer();

	try {
		// Check common file types first
		const commonResult = handleCommonFileTypes(url);
		if (commonResult) {
			if (verbose) logger.checkpoint('load handled as common file type', { url });
			return commonResult;
		}

		// Only process .vue files directly
		if (url.endsWith('.vue')) {
			if (verbose) logger.checkpoint('load handling Vue file', { url });
			try {
				const result = loadVue(url);
				recordFile('load', url, loadStart);
				if (verbose) logger.checkpoint('Vue file loaded successfully', { url });
				return result;
			} catch (error) {
				logger.error('Failed to compile Vue SFC', error, { url });
				throw new Error(`Failed to compile Vue SFC ${url}: ${error.message}`, { cause: error });
			}
		}

		// For TypeScript files, delegate to ts-node
		if (url.endsWith('.ts') || url.endsWith('.tsx')) {
			if (verbose) logger.checkpoint('load delegating to ts-node', { url });
			try {
				const tsNode = await getTsLoader();
				const result = await tsNode.load(url, context, nextLoad);
				recordFile('load', url, loadStart);
				if (verbose) logger.checkpoint('ts-node load success', { url });
				return result;
			} catch (error) {
				logger.error('ts-node failed', error, { url });
				throw new Error(`ts-node failed for ${url}: ${error.message}`, { cause: error });
			}
		}

		// For everything else, use the default loader
		if (verbose) logger.checkpoint('load delegating to nextLoad', { url });
		return nextLoad(url, context);
	} finally {
		recordPhase('esm:load', loadStart);
	}
}

export async function resolve(specifier, context, nextResolve) {
	if (verbose) logger.checkpoint('resolve', { specifier, parentURL: context.parentURL });
	const resolveStart = startTimer();

	try {
		// Try common resolution logic
		const resolved = resolveSpecifier(specifier, context, { checkExtensions: true });

		if (resolved) {
			if (verbose) logger.checkpoint('resolve success', { specifier, url: resolved.url });
			return resolved;
		}

		if (verbose) logger.checkpoint('resolve delegating to nextResolve', { specifier });
		return nextResolve(specifier, context);
	} finally {
		recordPhase('esm:resolve', resolveStart);
	}
}
