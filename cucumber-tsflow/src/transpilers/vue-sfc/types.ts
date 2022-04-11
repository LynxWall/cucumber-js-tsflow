import { SFCScriptCompileOptions, SFCStyleCompileOptions, SFCTemplateCompileOptions } from 'vue/compiler-sfc';
import type { RollupError, RollupWarning } from 'rollup';
import type * as _compiler from 'vue/compiler-sfc';

export interface Options {
	include?: string | RegExp | (string | RegExp)[];
	exclude?: string | RegExp | (string | RegExp)[];

	isProduction?: boolean;

	// options to pass on to vue/compiler-sfc
	script?: Partial<SFCScriptCompileOptions>;
	template?: Partial<SFCTemplateCompileOptions>;
	style?: Partial<SFCStyleCompileOptions>;

	/**
	 * Transform Vue SFCs into custom elements.
	 * - `true`: all `*.vue` imports are converted into custom elements
	 * - `string | RegExp`: matched files are converted into custom elements
	 *
	 * @default /\.ce\.vue$/
	 */
	customElement?: boolean | string | RegExp | (string | RegExp)[];

	/**
	 * Enable Vue reactivity transform (experimental).
	 * https://github.com/vuejs/core/tree/master/packages/reactivity-transform
	 * - `true`: transform will be enabled for all vue,js(x),ts(x) files except
	 *           those inside node_modules
	 * - `string | RegExp`: apply to vue + only matched files (will include
	 *                      node_modules, so specify directories in necessary)
	 * - `false`: disable in all cases
	 *
	 * @default false
	 */
	reactivityTransform?: boolean | string | RegExp | (string | RegExp)[];

	/**
	 * Use custom compiler-sfc instance. Can be used to force a specific version.
	 */
	compiler?: typeof _compiler;
}

export interface ResolvedOptions extends Options {
	compiler: typeof _compiler;
	root: string;
	sourceMap: boolean;
}

export interface VueResolvedId {
	external: boolean | 'absolute';
	id: string;
}

export interface VueTransformerContext {
	error: (err: RollupError | string, pos?: number | { column: number; line: number }) => void;
	resolve: (id: string) => VueResolvedId | null;
	warn: (warning: RollupWarning | string, pos?: number | { column: number; line: number }) => void;
}
