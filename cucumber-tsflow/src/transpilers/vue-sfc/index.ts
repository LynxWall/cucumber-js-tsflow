import { createFilter } from '@rollup/pluginutils';
import type { RollupError, RollupLog } from 'rollup';
import { resolveCompiler } from './compiler';
import { parseVueRequest } from './utils/query';
import { transformMain } from './main';
import type { Options, ResolvedOptions, VueTransformerContext, VueResolvedId } from './types';

export { parseVueRequest, VueQuery } from './utils/query';

class VueTransformer implements VueTransformerContext {
	private customElementFilter: (id: unknown) => boolean;
	private options: ResolvedOptions;
	private isSSR = (opt: { ssr?: boolean } | boolean | undefined) =>
		opt === undefined ? false : typeof opt === 'boolean' ? opt : opt?.ssr === true;

	constructor(rawOptions: Options = {}) {
		const { include = /\.vue$/, exclude, customElement = /\.ce\.vue$/, reactivityTransform = false } = rawOptions;
		this.customElementFilter = typeof customElement === 'boolean' ? () => customElement : createFilter(customElement);

		const rootDir: string = process.cwd();
		this.options = {
			isProduction: process.env.NODE_ENV === 'production',
			compiler: resolveCompiler(rootDir),
			...rawOptions,
			include,
			exclude,
			customElement,
			reactivityTransform,
			root: rootDir,
			sourceMap: true
		};
	}
	public error = (err: string | RollupError, pos?: number | { column: number; line: number } | undefined): void => {};
	public resolve = (id: string): VueResolvedId | null => {
		// serve sub-part requests (*?vue) as virtual modules
		if (parseVueRequest(id).query.vue) {
			return { external: false, id: id };
		}
		return null;
	};

	public warn = (warning: RollupLog | string, pos?: number | { column: number; line: number } | undefined): void => {};

	public transformCode = (code: string, filename: string) => {
		const ssr = this.isSSR(false);
		const result = transformMain(code, filename, this.options, this, ssr, this.customElementFilter(filename));
		return { code: result?.code, map: result?.map.mappings };
	};
}

export default VueTransformer;
