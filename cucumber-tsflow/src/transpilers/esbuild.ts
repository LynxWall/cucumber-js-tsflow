/**
 * The esbuild transform every tsflow transpiler runs.
 *
 * Two callers emit different module formats from the same transform: `transpileCode` here emits CommonJS
 * for ts-node's `Transpiler` plugin (`esbuild-transpiler.ts`, behind the `es-node` and `es-vue`
 * transpilers), and `esm/esbuild.mjs` emits ES modules for the esbuild ESM loaders, loading this module
 * through `createRequire` so that the options table, the loaders table, the cache-key recipe and the
 * timing live once. The ESM caller adds only what an ES module needs: tsconfig path aliases rewritten to
 * `file:` URLs before the transform, and those mappings in its cache key.
 */
import {
	Loader,
	transformSync,
	CommonOptions,
	TransformOptions,
	BuildOptions,
	version as esbuildVersion
} from 'esbuild';
import path from 'path';
import { experimentalDecorators } from '../utils/decorator-mode';
import { startTimer, recordFile } from '../utils/tsflow-timing';
import { withTranspileCache } from './transpile-cache';

export type TranspileOptions = {
	debug: boolean;
	esbuild?: CommonOptions & TransformOptions & BuildOptions;
};
const defaultOptions: TranspileOptions = {
	debug: true
};

/** What a caller fixes about its output: the module format, and for Node's ESM loader the platform. */
export type OutputFormat = Pick<CommonOptions, 'format' | 'platform'>;

export type TranspileResults = {
	output: string;
	sourceMap?: string;
};

export const loaders: Record<string, Loader> = {
	'.js': 'js',
	'.mjs': 'js',
	'.cjs': 'js',
	'.jsx': 'jsx',
	'.ts': 'ts',
	'.tsx': 'tsx',
	'.json': 'json'
};

const getLoaders = (options: TranspileOptions) => {
	const ret = { ...loaders };
	if (typeof options.esbuild?.loader == 'object') {
		for (const [e, l] of Object.entries(options.esbuild.loader)) ret[e] = l as Loader;
	}
	return ret;
};

/**
 * The esbuild transform options for `filename`: the output format, the fixed options every tsflow
 * transpile uses (es2022, no minification, an external source map, esbuild's own diagnostics silenced
 * because the thrown error carries the same text and the CLI reports it once, and a `tsconfigRaw`
 * carrying the decorator mode), the caller's `esbuild` overrides, and the loader the extension selects.
 *
 * @param filename - The file being transpiled; names the source in the map
 * @param ext - The extension that picks the loader, when it is not the file's own
 * @param options - The caller's overrides; `esbuild.loader` extends the loaders table
 * @param output - The module format (and platform) the caller emits
 * @param experimentalDecorators - Whether TypeScript's legacy decorators are compiled
 */
export function transformOptionsFor(
	filename: string,
	ext: string | undefined,
	options: Partial<TranspileOptions> | undefined,
	output: OutputFormat,
	experimentalDecorators: boolean
): TransformOptions {
	const merged: TranspileOptions = { ...defaultOptions, ...options };
	const loaderExt = ext ?? path.extname(filename);
	return {
		...output,
		logLevel: 'silent',
		target: ['es2022'],
		minify: false,
		sourcemap: 'external',
		tsconfigRaw: {
			compilerOptions: {
				...(experimentalDecorators ? { experimentalDecorators: true } : {}),
				importsNotUsedAsValues: 'remove',
				strict: true
			}
		},
		...(merged.esbuild as TransformOptions | undefined),
		loader: getLoaders(merged)[loaderExt],
		sourcefile: filename
	};
}

/**
 * The transpile-cache configuration for `transformOptions`: everything other than the source and the
 * file name that shapes esbuild's output (the full options, `tsconfigRaw` and the decorator mode among
 * them) and the esbuild version.
 */
export function esbuildCacheKey(transformOptions: TransformOptions): string {
	return `esbuild@${esbuildVersion}${JSON.stringify(transformOptions)}`;
}

/** Run esbuild once over `code` and record the file's transpile time. */
export function runEsbuild(code: string, filename: string, transformOptions: TransformOptions): TranspileResults {
	const start = startTimer();
	const ret = transformSync(code, transformOptions);
	recordFile('transpile', filename, start);
	return { output: ret.code, sourceMap: ret.map };
}

/** Transpile `code` to CommonJS, through the transpile cache. */
export const transpileCode = (
	code: string,
	filename: string,
	ext?: string,
	_options?: Partial<TranspileOptions>
): TranspileResults => {
	const transformOptions = transformOptionsFor(filename, ext, _options, { format: 'cjs' }, experimentalDecorators());
	return withTranspileCache('esbuild', filename, code, esbuildCacheKey(transformOptions), () =>
		runEsbuild(code, filename, transformOptions)
	);
};
