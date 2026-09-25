import MessageCollector from '../runtime/message-collector';

declare global {
	var messageCollector: MessageCollector;
	var enableVueStyle: boolean;
	var experimentalDecorators: boolean;
	/**
	 * Source maps of the modules the esbuild ESM loader transpiled on this thread, by module URL, set in
	 * `transpilers/esm/loader-utils.mjs` and read by `utils/our-callsite.ts`.
	 */
	var __CUCUMBER_TSFLOW_SOURCE_MAPS: Map<string, string> | undefined;
	/**
	 * Set by `bin/cucumber-tsflow.js` when it printed its bootstrap notice before requiring the library;
	 * `cli/run.ts` then prints the matching "loaded in N ms" line. Unset for programmatic use of the CLI.
	 */
	var __CUCUMBER_TSFLOW_BOOTSTRAP_ANNOUNCED: boolean | undefined;
}

export {};
