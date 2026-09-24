/**
 * The one library global the unit tests touch directly. The library declares it in `src/types/global.d.ts`,
 * which imports a runtime module and so cannot be part of this strict test program; this file repeats the
 * declaration, and must follow it if the shape changes.
 */
declare global {
	/** Source maps of the modules the esbuild ESM loader transpiled on this thread, by module URL. */
	// eslint-disable-next-line no-var
	var __CUCUMBER_TSFLOW_SOURCE_MAPS: Map<string, string> | undefined;
}

export {};
