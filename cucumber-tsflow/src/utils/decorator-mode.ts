/**
 * The decorator mode, TypeScript's `experimentalDecorators`, as one value.
 *
 * `loadConfiguration` decides it once per run. Two kinds of code then read it: the decorators in `bindings/`
 * branch on it every time one is applied, and the transpilers compile for it (esbuild for CommonJS and for
 * ES modules, the Vue SFC compiler and the ts-node ESM service each set TypeScript's option from it, and the
 * transpile cache keys on it). The transpilers run in three places: the main process, the loader hooks
 * thread that `module.register()` creates, and the parallel child processes. A global reaches none of those
 * from here; the environment reaches all of them, because a worker thread and a forked child both start with
 * a copy of the parent's `process.env`. So the environment is the value the transpilers read, on every call
 * rather than when their module loads, and the global is written alongside it for the decorators' hot path.
 */
const ENVIRONMENT_VARIABLE = 'CUCUMBER_EXPERIMENTAL_DECORATORS';

/**
 * Record the decorator mode for this process and for everything it starts: the environment for the
 * transpilers on any thread or in any child, the global for the decorators.
 */
export function setExperimentalDecorators(enabled: boolean): void {
	global.experimentalDecorators = enabled;
	process.env[ENVIRONMENT_VARIABLE] = String(enabled);
}

/** Whether TypeScript's legacy decorators are in use, as `setExperimentalDecorators` last recorded it. */
export function experimentalDecorators(): boolean {
	return process.env[ENVIRONMENT_VARIABLE] === 'true';
}
