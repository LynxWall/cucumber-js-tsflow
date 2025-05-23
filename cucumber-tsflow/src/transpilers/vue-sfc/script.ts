import type { SFCDescriptor, SFCScriptBlock } from 'vue/compiler-sfc';
import type { ResolvedOptions } from './types';
import { resolveTemplateCompilerOptions } from './template';

// ssr and non ssr builds would output different script content
const clientCache = new WeakMap<SFCDescriptor, SFCScriptBlock | null>();
const ssrCache = new WeakMap<SFCDescriptor, SFCScriptBlock | null>();

export const getResolvedScript = (descriptor: SFCDescriptor, ssr: boolean): SFCScriptBlock | null | undefined => {
	return (ssr ? ssrCache : clientCache).get(descriptor);
};

// Check if we can use compile template as inlined render function
// inside <script setup>. This can only be done for build because
// inlined template cannot be individually hot updated.
export const isUseInlineTemplate = (descriptor: SFCDescriptor, isProd: boolean): boolean => {
	return isProd && !!descriptor.scriptSetup && !descriptor.template?.src;
};

export const resolveScript = (
	descriptor: SFCDescriptor,
	options: ResolvedOptions,
	ssr: boolean
): SFCScriptBlock | null => {
	if (!descriptor.script && !descriptor.scriptSetup) {
		return null;
	}

	const cacheToUse = ssr ? ssrCache : clientCache;
	const cached = cacheToUse.get(descriptor);
	if (cached) {
		return cached;
	}

	let resolved: SFCScriptBlock | null = null;

	resolved = options.compiler.compileScript(descriptor, {
		...options.script,
		id: descriptor.id,
		isProd: options.isProduction,
		inlineTemplate: isUseInlineTemplate(descriptor, true),
		templateOptions: resolveTemplateCompilerOptions(descriptor, options, ssr),
		sourceMap: options.sourceMap
	});

	cacheToUse.set(descriptor, resolved);
	return resolved;
};
