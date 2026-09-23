import { pathToFileURL } from 'url';
import { createRequire } from 'node:module';
import { resolveSpecifier } from './loader-utils.mjs';
import { loadConfig } from 'tsconfig-paths';
import path from 'path';
import { createLogger, describeThrowable, isVerbose, messageOf } from '../../utils/tsflow-logger.mjs';
import { startTimer, recordPhase, recordFile } from '../../utils/tsflow-timing.mjs';

// TSFLOW_TIMING support: receives the timing MessagePort passed via module.register() data
export { initialize } from '../../utils/tsflow-timing.mjs';

// This loader delegates to ts-node's asynchronous ESM hooks, so it is always registered with
// module.register() and runs on the loader hooks thread.

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

// Compile the tsconfig path-mapping regexes once per process; `load` runs them once per file.
function compilePathMappings(paths) {
	return Object.entries(paths || {}).map(([pattern, replacements]) => {
		const searchPattern = pattern.replace('/*', '/');
		return {
			searchPattern,
			replacementPath: replacements[0].replace('/*', ''),
			searchRegex: new RegExp(`(from\\s+['"])${searchPattern}([^'"]+)(['"])`, 'g')
		};
	});
}

const pathMappings = configLoaderResult.resultType === 'success' ? compilePathMappings(configLoaderResult.paths) : [];

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
	// `files` only controls whether ts-node globs the tsconfig `files`/`include` set to seed the
	// language service, and that list is consumed only when `transpileOnly` is false. With
	// `transpileOnly: true` the walk is pure cost, so it is disabled here regardless of the
	// consumer's tsconfig `ts-node.files` setting.
	files: false,
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

/**
 * An error thrown from these hooks reaches the main thread by structured clone, which carries over only genuine
 * `Error` instances. ts-node's `TSError` is built by make-error without calling `Error`, so it arrived as an
 * empty object with no prototype: the CLI could name neither the file nor the diagnostic (`undefined: undefined`).
 * Rebuild such a value as a plain `Error` with the same text and stack, naming the module it happened in.
 */
function transferableError(error, url) {
	if (Object.prototype.toString.call(error) === '[object Error]') return error;
	const name = typeof error?.name === 'string' && error.name !== 'Error' ? `${error.name}: ` : '';
	const plain = new Error(`${name}${messageOf(error).trimEnd()} (while loading ${url})`);
	if (typeof error?.stack === 'string') plain.stack = error.stack;
	return plain;
}

export async function resolve(specifier, context, nextResolve) {
	if (verbose) logger.checkpoint('resolve', { specifier, parentURL: context.parentURL });
	const resolveStart = startTimer();

	try {
		// Try common resolution logic (tsconfig paths, extension probing)
		const resolved = resolveSpecifier(specifier, context, { checkExtensions: true });

		if (resolved) {
			if (verbose) logger.checkpoint('resolve success', { specifier, url: resolved.url });
			return resolved;
		}

		// Fall back to ts-node's resolver. Explicit `.ts`/`.tsx` specifiers are always ES modules here,
		// whatever ts-node's package-type classification says.
		if (verbose) logger.checkpoint('resolve delegating to ts-node', { specifier });
		const result = await esmHooks.resolve(specifier, context, nextResolve);
		if (specifier.endsWith('.ts') || specifier.endsWith('.tsx')) {
			return { ...result, format: 'module' };
		}
		return result;
	} catch (error) {
		if (verbose) logger.checkpoint('resolve failed', { specifier, error: describeThrowable(error) });
		throw transferableError(error, context.parentURL ?? specifier);
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

				// If we have path mappings, rewrite aliased imports to absolute file URLs. A single
				// `replace` pass per alias both detects and rewrites, so no separate scan is needed.
				if (pathMappings.length > 0) {
					let code = result.source.toString();
					let replacementCount = 0;

					for (const { searchPattern, replacementPath, searchRegex } of pathMappings) {
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
					}

					if (replacementCount > 0) {
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
				if (verbose) logger.checkpoint('load failed', { url, error: describeThrowable(error) });
				throw transferableError(error, url);
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
