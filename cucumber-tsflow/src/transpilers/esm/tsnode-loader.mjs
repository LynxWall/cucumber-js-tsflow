import { pathToFileURL } from 'url';
import { createRequire } from 'node:module';
import { resolveSpecifier } from './loader-utils.mjs';
import { loadConfig } from 'tsconfig-paths';
import path from 'path';
import { createLogger, isVerbose } from '../../utils/tsflow-logger.mjs';
import { startTimer, recordPhase, recordFile } from '../../utils/tsflow-timing.mjs';

// TSFLOW_TIMING support: receives the timing MessagePort passed via module.register() data
export { initialize } from '../../utils/tsflow-timing.mjs';

const logger = createLogger('tsnode-loader');
const require = createRequire(import.meta.url);

// Per-file checkpoints in the resolve/load hot paths are guarded so their detail
// objects and template strings are never built when verbose logging is off.
const verbose = isVerbose();

logger.checkpoint('Initializing tsnode-loader');

const initStart = startTimer();

// Load tsconfig to get paths
const configLoaderResult = loadConfig(process.cwd());
let paths = {};
let baseUrl = './';

if (configLoaderResult.resultType === 'success') {
	paths = configLoaderResult.paths || {};
	baseUrl = configLoaderResult.baseUrl || './';
	logger.checkpoint('tsconfig loaded', {
		baseUrl,
		pathCount: Object.keys(paths).length,
		cwd: process.cwd()
	});
} else {
	logger.warn('tsconfig load failed', {
		resultType: configLoaderResult.resultType,
		cwd: process.cwd()
	});
}

// Create ts-node service with our configuration
logger.checkpoint('Loading ts-node-maintained');
const tsNode = require('ts-node-maintained');

const experimentalDecorators = process.env.CUCUMBER_EXPERIMENTAL_DECORATORS === 'true';

logger.checkpoint('Creating ts-node service', {
	experimentalDecorators,
	baseUrl,
	pathCount: Object.keys(paths).length
});

const service = tsNode.create({
	esm: true,
	experimentalSpecifierResolution: 'node',
	files: true,
	transpileOnly: true,
	compilerOptions: {
		experimentalDecorators,
		module: 'ESNext',
		target: 'ES2022',
		baseUrl: baseUrl,
		paths: paths
	}
});

logger.checkpoint('ts-node service created');

// Create ESM hooks from the service
const esmHooks = tsNode.createEsmHooks(service);
logger.checkpoint('ESM hooks created');
recordPhase('esm:hooks-init', initStart);

export async function resolve(specifier, context, nextResolve) {
	if (verbose) logger.checkpoint('resolve', { specifier, parentURL: context.parentURL });
	const resolveStart = startTimer();

	try {
		// Try common resolution logic
		const resolved = await resolveSpecifier(specifier, context, {
			checkExtensions: true,
			handleTsFiles: true,
			tsNodeHooks: esmHooks,
			nextResolve
		});

		if (resolved) {
			if (verbose) logger.checkpoint('resolve success', { specifier, url: resolved.url });
			return resolved;
		}

		// Fall back to ts-node's resolver
		if (verbose) logger.checkpoint('resolve delegating to ts-node', { specifier });
		return esmHooks.resolve(specifier, context, nextResolve);
	} finally {
		recordPhase('esm:resolve', resolveStart);
	}
}

export const load = async (url, context, nextLoad) => {
	if (verbose) logger.checkpoint('load', { url });
	const loadStart = startTimer();

	try {
		// Only intercept TypeScript files for path rewriting
		if (url.endsWith('.ts') || url.endsWith('.tsx')) {
			if (verbose) logger.checkpoint('load handling TypeScript', { url });

			try {
				// First, let ts-node load the file
				const result = await esmHooks.load(url, context, nextLoad);

				// If we have path mappings, check if we need to rewrite the source
				if (configLoaderResult.resultType === 'success' && configLoaderResult.paths) {
					let code = result.source.toString();
					let modified = false;
					let replacementCount = 0;

					for (const [pattern, replacements] of Object.entries(configLoaderResult.paths)) {
						const searchPattern = pattern.replace('/*', '/');
						const searchRegex = new RegExp(`(from\\s+['"])${searchPattern}([^'"]+)(['"])`, 'g');

						if (searchRegex.test(code)) {
							const replacementPath = replacements[0].replace('/*', '');

							code = code.replace(searchRegex, (match, prefix, importPath, suffix) => {
								const fullPath = path.join(configLoaderResult.absoluteBaseUrl, replacementPath, importPath);
								const fileUrl = pathToFileURL(fullPath).href;

								replacementCount++;
								if (verbose) {
									logger.checkpoint('Path rewritten', {
										from: `${searchPattern}${importPath}`,
										to: fileUrl
									});
								}

								return `${prefix}${fileUrl}${suffix}`;
							});

							modified = true;
						}
					}

					if (modified) {
						recordFile('load', url, loadStart);
						if (verbose) {
							logger.checkpoint('load complete with path rewrites', {
								url,
								replacementCount
							});
						}
						return {
							...result,
							source: code
						};
					}
				}

				recordFile('load', url, loadStart);
				if (verbose) logger.checkpoint('load complete', { url });
				return result;
			} catch (error) {
				logger.error('load failed', error, { url });
				throw error;
			}
		}

		// For non-TypeScript files, let ts-node handle it
		if (verbose) logger.checkpoint('load delegating to ts-node', { url });
		return esmHooks.load(url, context, nextLoad);
	} finally {
		recordPhase('esm:load', loadStart);
	}
};

export const getFormat = esmHooks.getFormat;
export const transformSource = esmHooks.transformSource;
