import path from 'path';
import hash from 'hash-sum';
import type { CompilerError, SFCDescriptor } from 'vue/compiler-sfc';
import type { VueQuery } from './query';
import type { ResolvedOptions } from '../types';

// compiler-sfc should be exported so it can be re-used
export interface SFCParseResult {
	descriptor: SFCDescriptor;
	errors: Array<CompilerError | SyntaxError>;
}

const cache = new Map<string, SFCDescriptor>();
const prevCache = new Map<string, SFCDescriptor | undefined>();

/**
 * code copied from slash npm package to resolve issue with latest
 * version being esm only
 */
const slash = (path: string): string => {
	const isExtendedLengthPath = /^\\\\\?\\/.test(path);
	const hasNonAscii = /[^\u0000-\u0080]+/.test(path); // eslint-disable-line no-control-regex

	if (isExtendedLengthPath || hasNonAscii) {
		return path;
	}
	return path.replace(/\\/g, '/');
};

export const createDescriptor = (
	filename: string,
	source: string,
	{ root, isProduction, sourceMap, compiler }: ResolvedOptions
): SFCParseResult => {
	const { descriptor, errors } = compiler.parse(source, {
		filename,
		sourceMap
	});

	// ensure the path is normalized in a way that is consistent inside
	// project (relative to root) and on different systems.
	const normalizedPath = slash(path.normalize(path.relative(root, filename)));
	descriptor.id = hash(normalizedPath + (isProduction ? source : ''));

	cache.set(filename, descriptor);
	return { descriptor, errors };
};

export const getPrevDescriptor = (filename: string): SFCDescriptor | undefined => {
	return prevCache.get(filename);
};

export const setPrevDescriptor = (filename: string, entry: SFCDescriptor): void => {
	prevCache.set(filename, entry);
};

export const getDescriptor = (
	source: string,
	filename: string,
	options: ResolvedOptions,
	createIfNotFound = true
): SFCDescriptor | undefined => {
	if (cache.has(filename)) {
		return cache.get(filename)!;
	}
	if (createIfNotFound) {
		const { descriptor, errors } = createDescriptor(filename, source, options);
		if (errors.length) {
			throw errors[0];
		}
		return descriptor;
	}
	return undefined;
};

export const getSrcDescriptor = (filename: string, query: VueQuery): SFCDescriptor => {
	return cache.get(`${filename}?src=${query.src}`)!;
};

export const setSrcDescriptor = (filename: string, entry: SFCDescriptor): void => {
	// if multiple Vue files use the same src file, they will be overwritten
	// should use other key
	cache.set(`${filename}?src=${entry.id}`, entry);
};
