/**
 * Keeping support code loaded across runs of one process: the mechanics behind `--watch`.
 *
 * A fresh process spends most of a filtered run's startup loading modules that never change between two
 * edits: the test framework, jsdom, Vue and the component library, the project's shared helpers. A process
 * that stays alive keeps them, and pays on the next run only for what has to be evaluated again:
 *
 * - **Support files that registered something.** CucumberJS's library builder is reset before every load,
 *   and a file's decorators register with it while the file evaluates, so a file that contributed step
 *   definitions, hooks, parameter types, a `World`, a default timeout or a definition wrapper must run again
 *   for the new library to contain them. A file that registered nothing (a set-up module such as the jsdom
 *   initialisation) is evaluated once and kept: running it again would gain the library nothing, and
 *   running set-up twice is exactly what a resident process must avoid.
 * - **Changed files and everything that depends on them.** An edited module and every project module that
 *   imports or requires it, directly or through others (`dependentProjectModules()`), so that no kept module
 *   holds on to the previous version. Files new to the run are evaluated too.
 * - **Modules that apply decorators without being support files.** A helper that defines a `@binding` class
 *   and is imported by a support file registers only when it evaluates, and a cached helper would not; such
 *   modules are found from the registry's callsites after each load and evaluated on every run.
 *
 * The previous run's bindings are cleared from the `BindingRegistry` first, so nothing stale can shadow a
 * re-registered binding. How a module is made to evaluate again depends on its module system and is the
 * business of `utils/module-graph.ts`: CommonJS modules are evicted from `require.cache`; ES modules are
 * given a version that the in-thread `resolve` hook appends to their URL as a query, since Node's module
 * map cannot be invalidated. That hook must run in this thread (the esbuild ESM loaders under
 * `module.registerHooks()`): a loader on Node's loader hooks thread (`ts-node-maintained/esm`, third-party
 * loaders, `TSFLOW_ESM_HOOKS=async`) neither records the import graph nor sees the versions, so
 * `unsupportedReason()` tells the CLI to fall back to a fresh process per run.
 *
 * What a resident process cannot undo: module-level state in kept modules persists between runs (it does
 * within one run's `BeforeAll`/`AfterAll` too), the previous instances of re-evaluated ES modules stay in
 * Node's module map, and a class re-evaluated in one run is not `instanceof`-compatible with an instance
 * created by the previous one; scenarios create their instances afresh, so the last only matters to
 * module-level singletons that hold class instances across runs.
 */
import type { ISupportCodeCoordinates } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import { BindingRegistry } from '../bindings/binding-registry';
import { describeTranspiler } from '../utils/startup-progress';
import {
	bumpModuleVersions,
	dependentProjectModules,
	evictRequiredModules,
	knownProjectModules,
	notifyReload
} from '../utils/module-graph';
import { canonicalFromFrameFile, canonicalPath } from '../utils/paths';
import { createLogger } from '../utils/tsflow-logger';
import { BuilderFingerprint, builderFingerprint, registeredBeyondSteps } from './builder-fingerprint';
import { loaderHooksMode } from './register-loaders';
import type { SupportFileKind, SupportLoadRecorder } from './support';

const logger = createLogger('support-reloader');

/** What `prepare()` decided for a run after the first. */
export interface SupportReloadSummary {
	/** 1 for the first rerun, counting up. */
	generation: number;
	/** Support files that will be evaluated again. */
	reevaluated: number;
	/** Support files kept from the previous run. */
	kept: number;
	/** Project modules other than support files that will be evaluated again (changed files and their dependents). */
	modules: number;
}

/**
 * Observes what each support file registers, remembers it between runs, and before each rerun makes the
 * modules that have to load again do so. One instance per resident process, passed to `runCucumber` on
 * every run through its `session` argument.
 */
export class SupportReloader implements SupportLoadRecorder {
	private generation = 0;
	private started = false;
	/** By canonical support-file path: whether the file registered anything when it was last evaluated. */
	private readonly entries = new Map<string, boolean>();
	/** Canonical paths of modules that applied decorators without being support files; evaluated every run. */
	private readonly bindingModules = new Set<string>();
	/** Canonical paths of everything this run evaluates again; undefined on the first run, where that is everything. */
	private reevaluate: ReadonlySet<string> | undefined;
	/** Observations of this run's loads, by canonical support-file path. */
	private readonly observed = new Map<string, boolean>();
	private current: { key: string; before: BuilderFingerprint; registered: boolean } | undefined;
	private removeListener: (() => void) | undefined;
	private sources: string[] = [];
	private entryPaths: string[] = [];

	/**
	 * Why a resident process cannot reload these coordinates in place, or undefined when it can. A loader
	 * attached with `module.register()` runs on Node's loader hooks thread, where neither the import graph
	 * nor the module versions of this thread are visible.
	 */
	static unsupportedReason(coordinates: ISupportCodeCoordinates): string | undefined {
		const asyncLoader = coordinates.loaders.find(loader => loaderHooksMode(loader) === 'async');
		return asyncLoader
			? `the ${describeTranspiler([], [asyncLoader]) ?? asyncLoader} loader runs on Node's loader hooks thread, where modules cannot be reloaded in place`
			: undefined;
	}

	/**
	 * Called by `runCucumber` once the paths are resolved and before any support file loads. On the first run
	 * it only starts observing. On every later run it clears the registry, evicts or versions the modules
	 * that have to evaluate again, and returns what it decided.
	 *
	 * @param changedPaths - Files changed since the previous run, absolute or relative to the working directory
	 * @param sourcePaths - Resolved feature files (remembered for `watchedFiles()`)
	 * @param requirePaths - Resolved `require` support files
	 * @param importPaths - Resolved `import` support files
	 */
	prepare(
		changedPaths: readonly string[],
		sourcePaths: readonly string[],
		requirePaths: readonly string[],
		importPaths: readonly string[]
	): SupportReloadSummary | undefined {
		this.sources = sourcePaths.slice();
		this.entryPaths = [...requirePaths, ...importPaths];
		this.observed.clear();
		this.current = undefined;
		this.removeListener?.();
		this.removeListener = BindingRegistry.instance.addRegistrationListener(() => {
			if (this.current) this.current.registered = true;
		});
		if (!this.started) {
			this.started = true;
			this.reevaluate = undefined;
			return undefined;
		}

		this.generation++;
		const entryKeys = this.entryPaths.map(canonicalPath);
		// Bindings registered while the previous run executed (support code calling `loadSupport` itself, say)
		// are in the registry now and were not when it finished loading
		this.noteBindingModules(new Set(entryKeys));
		const changed = new Set(changedPaths.map(canonicalPath));
		const set = new Set<string>(changed);
		for (const dependent of dependentProjectModules(changed)) set.add(dependent);
		for (const key of entryKeys) {
			const registered = this.entries.get(key);
			if (registered === undefined || registered) set.add(key);
		}
		for (const module of this.bindingModules) set.add(module);

		const evicted = evictRequiredModules(set);
		bumpModuleVersions(set, this.generation);
		BindingRegistry.instance.clear();
		notifyReload();
		this.reevaluate = set;

		const entryKeySet = new Set(entryKeys);
		const reevaluated = entryKeys.filter(key => set.has(key)).length;
		let modules = 0;
		for (const key of set) if (!entryKeySet.has(key)) modules++;
		const summary = {
			generation: this.generation,
			reevaluated,
			kept: entryKeys.length - reevaluated,
			modules
		};
		logger.checkpoint('Prepared support reload', { ...summary, evicted, changed: changed.size });
		return summary;
	}

	/** `SupportLoadRecorder`: a support file is about to be required or imported. */
	beginFile(file: string, _kind: SupportFileKind): void {
		this.current = { key: canonicalPath(file), before: builderFingerprint(), registered: false };
	}

	/** `SupportLoadRecorder`: the support file has finished evaluating. */
	endFile(): void {
		const current = this.current;
		if (!current) return;
		this.current = undefined;
		const after = builderFingerprint();
		const registered =
			current.registered || after.steps !== current.before.steps || registeredBeyondSteps(current.before, after);
		this.observed.set(current.key, registered);
	}

	/**
	 * The support code has loaded: remember what each evaluated file registered (a kept file's observation
	 * is empty and is not recorded over its previous one), and note every module that applied decorators
	 * without being a support file.
	 */
	finish(): void {
		this.removeListener?.();
		this.removeListener = undefined;
		for (const [key, registered] of this.observed) {
			if (!this.reevaluate || this.reevaluate.has(key)) this.entries.set(key, registered);
		}
		this.noteBindingModules(new Set(this.entryPaths.map(canonicalPath)));
		this.observed.clear();
	}

	/** Remember every module in the registry's callsites that is not one of `entryKeys`. */
	private noteBindingModules(entryKeys: ReadonlySet<string>): void {
		for (const raw of BindingRegistry.instance.getBindingSourceFiles()) {
			const key = canonicalFromFrameFile(raw);
			if (key && !entryKeys.has(key)) this.bindingModules.add(key);
		}
	}

	/**
	 * The load failed. Nothing is recorded, and every file this run meant to evaluate is forgotten, so the
	 * next run evaluates it again rather than trusting a module that may have thrown half way through.
	 */
	abort(): void {
		this.removeListener?.();
		this.removeListener = undefined;
		this.current = undefined;
		for (const key of this.reevaluate ?? this.observed.keys()) this.entries.delete(key);
		this.observed.clear();
	}

	/**
	 * Every file whose change should trigger a rerun: the feature files, the support files and every project
	 * module loaded so far. Canonical paths.
	 */
	watchedFiles(): string[] {
		const files = new Set<string>(this.sources.map(canonicalPath));
		for (const entry of this.entryPaths) files.add(canonicalPath(entry));
		for (const module of knownProjectModules()) files.add(module);
		return Array.from(files);
	}
}
