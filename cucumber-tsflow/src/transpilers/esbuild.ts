import { Loader, transformSync, CommonOptions, TransformOptions, BuildOptions } from 'esbuild';
import path from 'path';

export type TranspileOptions = {
	type: 'bundle' | 'transform';
	debug: boolean;
	esbuild?: CommonOptions & TransformOptions & BuildOptions;
};
const defaultOptions: TranspileOptions = {
	type: 'transform',
	debug: false
};

const commonOptions: CommonOptions = {
	format: 'cjs',
	logLevel: 'error',
	target: [`node${process.version.slice(1)}`],
	minify: false,
	sourcemap: 'external'
};

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

	const ret = transformSync(code, {
		...commonOptions,
		...(options.esbuild as TransformOptions | undefined),
		loader: loaders[loaderExt],
		sourcefile: filename
	});
	return { output: ret.code, sourceMap: ret.map };
};
