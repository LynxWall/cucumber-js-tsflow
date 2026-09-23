import {
	Loader,
	transformSync,
	CommonOptions,
	TransformOptions,
	BuildOptions,
	version as esbuildVersion
} from 'esbuild';
import path from 'path';
import { startTimer, recordFile } from '../utils/tsflow-timing';
import { withTranspileCache } from './transpile-cache';

export type TranspileOptions = {
	debug: boolean;
	esbuild?: CommonOptions & TransformOptions & BuildOptions;
};
const defaultOptions: TranspileOptions = {
	debug: true
};

const commonOptions: CommonOptions = {
	format: 'cjs',
	// esbuild would otherwise print its own diagnostic to stderr from inside transformSync, on top of the open progress
	// line; the thrown error carries the same text (file, line, column and message) and is reported once by the CLI
	logLevel: 'silent',
	target: [`es2022`],
	minify: false,
	sourcemap: 'external'
};

if (global.experimentalDecorators) {
	commonOptions.tsconfigRaw = {
		compilerOptions: {
			experimentalDecorators: true,
			importsNotUsedAsValues: 'remove',
			strict: true
		}
	};
} else {
	commonOptions.tsconfigRaw = {
		compilerOptions: {
			importsNotUsedAsValues: 'remove',
			strict: true
		}
	};
}

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

export const supports = (filename: string) => {
	if (filename.includes('node_modules') || filename.includes('cucumber-tsflow/lib')) return false;
	return path.extname(filename) in loaders;
};

const getLoaders = (options: TranspileOptions) => {
	const ret = { ...loaders };
	if (typeof options.esbuild?.loader == 'object') {
		for (const [e, l] of Object.entries(options.esbuild.loader)) ret[e] = l as Loader;
	}
	return ret;
};

export const transpileCode = (
	code: string,
	filename: string,
	ext?: string,
	_options?: Partial<TranspileOptions>
): TranspileResults => {
	const options: TranspileOptions = { ...defaultOptions, ..._options };
	const loaders = getLoaders(options);
	const loaderExt = ext != undefined ? ext : path.extname(filename);

	const transformOptions: TransformOptions = {
		...commonOptions,
		...(options.esbuild as TransformOptions | undefined),
		loader: loaders[loaderExt],
		sourcefile: filename
	};

	// Cached on the source plus everything else that shapes the output: the full transform options
	// (including `tsconfigRaw`, which carries the decorator mode) and the esbuild version.
	return withTranspileCache(
		'esbuild-cjs',
		filename,
		code,
		`esbuild@${esbuildVersion}${JSON.stringify(transformOptions)}`,
		() => {
			const start = startTimer();
			const ret = transformSync(code, transformOptions);
			recordFile('transpile', filename, start);
			return { output: ret.code, sourceMap: ret.map };
		}
	);
};
