import type {
	SFCDescriptor,
	SFCTemplateCompileOptions,
	SFCTemplateCompileResults,
	CompilerOptions
} from 'vue/compiler-sfc';
import type { ResolvedOptions, VueTransformerContext } from './types';
import { getResolvedScript } from './script';
import { createRollupError } from './utils/error';

/**
 * transform the template directly in the main SFC module
 */
export const transformTemplateInMain = (
	code: string,
	descriptor: SFCDescriptor,
	options: ResolvedOptions,
	transformerContext: VueTransformerContext,
	ssr: boolean
): SFCTemplateCompileResults => {
	const result = compile(code, descriptor, options, transformerContext, ssr);
	return {
		...result,
		code: result.code.replace(/\nexport (function|const) (render|ssrRender)/, '\n$1 _sfc_$2')
	};
};

export const compile = (
	code: string,
	descriptor: SFCDescriptor,
	options: ResolvedOptions,
	transformerContext: VueTransformerContext,
	ssr: boolean
) => {
	const filename = descriptor.filename;
	const result = options.compiler.compileTemplate({
		...resolveTemplateCompilerOptions(descriptor, options, ssr)!,
		source: code
	});

	if (result.errors.length) {
		result.errors.forEach(error =>
			transformerContext.error(
				typeof error === 'string' ? { id: filename, message: error } : createRollupError(filename, error)
			)
		);
	}

	if (result.tips.length) {
		result.tips.forEach(tip =>
			transformerContext.warn({
				id: filename,
				message: tip
			})
		);
	}

	return result;
};

export const resolveTemplateCompilerOptions = (
	descriptor: SFCDescriptor,
	options: ResolvedOptions,
	ssr: boolean
): Omit<SFCTemplateCompileOptions, 'source'> | undefined => {
	const block = descriptor.template;
	if (!block) {
		return undefined;
	}
	const resolvedScript = getResolvedScript(descriptor, ssr);
	const hasScoped = descriptor.styles.some(s => s.scoped);
	const { id, filename, cssVars } = descriptor;

	let transformAssetUrls = options.template?.transformAssetUrls;

	// compiler-sfc should export `AssetURLOptions`
	// build: force all asset urls into import requests so that they go through
	// the assets plugin for asset registration

	const assetUrlOptions = {
		includeAbsolute: true
	};

	if (transformAssetUrls && typeof transformAssetUrls === 'object') {
		// presence of array fields means this is raw tags config
		if (Object.values(transformAssetUrls).some(val => Array.isArray(val))) {
			transformAssetUrls = {
				...assetUrlOptions,
				tags: transformAssetUrls as any
			};
		} else {
			transformAssetUrls = { ...transformAssetUrls, ...assetUrlOptions };
		}
	} else {
		transformAssetUrls = false;
	}

	let preprocessOptions = block.lang && options.template?.preprocessOptions;
	if (block.lang === 'pug') {
		preprocessOptions = {
			doctype: 'html',
			...preprocessOptions
		};
	}

	// if using TS, support TS syntax in template expressions
	const expressionPlugins: CompilerOptions['expressionPlugins'] =
		options.template?.compilerOptions?.expressionPlugins || [];
	const lang = descriptor.scriptSetup?.lang || descriptor.script?.lang;
	if (lang && /tsx?$/.test(lang) && !expressionPlugins.includes('typescript')) {
		expressionPlugins.push('typescript');
	}

	return {
		...options.template,
		id,
		filename,
		scoped: hasScoped,
		slotted: descriptor.slotted,
		isProd: options.isProduction,
		inMap: block.src ? undefined : block.map,
		ssr,
		ssrCssVars: cssVars,
		transformAssetUrls: transformAssetUrls,
		preprocessLang: block.lang,
		preprocessOptions,
		compilerOptions: {
			...options.template?.compilerOptions,
			scopeId: hasScoped ? `data-v-${id}` : undefined,
			bindingMetadata: resolvedScript ? resolvedScript.bindings : undefined,
			expressionPlugins,
			sourceMap: options.sourceMap
		}
	};
};
