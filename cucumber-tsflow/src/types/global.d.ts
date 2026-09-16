import MessageCollector from '../runtime/message-collector';

declare global {
	// eslint-disable-next-line no-var
	var messageCollector: MessageCollector;
	// eslint-disable-next-line no-var
	var enableVueStyle: boolean;
	// eslint-disable-next-line no-var
	var experimentalDecorators: boolean;
	// eslint-disable-next-line no-var
	var __LOADER_WORKER: boolean;
	/**
	 * Source maps of the modules the esbuild ESM loader transpiled on this thread, by module URL, set in
	 * `transpilers/esm/loader-utils.mjs` and read by `utils/our-callsite.ts`.
	 */
	// eslint-disable-next-line no-var
	var __CUCUMBER_TSFLOW_SOURCE_MAPS: Map<string, string> | undefined;
}

export {};
