/**
 * Selective support loading: the `selectiveLoad` option.
 *
 * A filtered run (`--name`, `--tags`, one feature file, `file:line`) normally transpiles and evaluates the
 * whole support tree to discover that it needed a handful of step definitions. With `selectiveLoad` on,
 * `runCucumber` parses the feature files first (it does so regardless) and asks a `SelectiveLoadSession`
 * which support files the selected scenarios actually need. The answer comes from an index that earlier
 * runs wrote: for every support file, the step patterns registered while it loaded, whether it did anything
 * other than register step definitions, and a stamp (mtime and size) of every project module in its import
 * graph.
 *
 * The rules that keep a selective run equivalent to a full one:
 *
 * - A file is loaded if any selected step's text matches one of its patterns, matched with the same
 *   expression classes CucumberJS uses and with the parameter types the index recorded. Every file with a
 *   matching pattern is loaded, so ambiguities and tag-scoped alternatives are all present.
 * - A file is always loaded if it registered anything but step definitions: hooks, parameter types, a
 *   World constructor, a default timeout, a definition wrapper, or nothing at all (a set-up file).
 * - A file is loaded if it is new, if its record could not be compiled, or if any module in its recorded
 *   import graph has changed since the record was written. A loaded file's record is rewritten from what
 *   this run observed; an unloaded file's record was just validated and is kept.
 * - If any selected step matches no indexed pattern the whole tree is loaded, so an undefined step is
 *   reported exactly as a full run would, and the index is rebuilt in full.
 *
 * What it cannot see: a step pattern that is not a literal in the module graph (read from a file or the
 * environment), step definitions inside `node_modules`, and module-level side effects in a file that
 * otherwise only defines steps. That last one is the assumption the option rests on and is documented in
 * the README. The index lives beside the transpile cache, one file per configuration, keyed on the working
 * directory, the support-code coordinates, the decorator mode and this library's version.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { threadId } from 'node:worker_threads';
import type { Pickle } from '@cucumber/messages';
import { describeTranspiler } from '../utils/startup-progress';
import type {
	ISupportCodeCoordinates,
	SupportCodeLibrary
} from '@cucumber/cucumber/lib/support_code_library_builder/types';
import type { CucumberExpression, RegularExpression } from '@cucumber/cucumber-expressions';
import { version as tsflowVersion } from '../version';
import { BindingRegistry } from '../bindings/binding-registry';
import { StepBinding, StepBindingFlags } from '../bindings/step-binding';
import { getCacheRootDirectory } from '../transpilers/transpile-cache';
import { canonicalPath, importedProjectModules, requiredProjectModules } from '../utils/module-graph';
import { startTimer, recordPhase } from '../utils/tsflow-timing';
import { createLogger } from '../utils/tsflow-logger';
import { loaderHooksMode } from './register-loaders';
import type { SupportFileKind, SupportLoadRecorder } from './support';
import { BuilderFingerprint, builderFingerprint, builderInternals, registeredBeyondSteps } from './builder-fingerprint';

const logger = createLogger('selective-load');

// The expression classes are taken through CucumberJS's own dependency so the matching here uses exactly
// the version its step definitions are built with, without declaring a second copy.
type ExpressionsModule = typeof import('@cucumber/cucumber-expressions');
const { ExpressionFactory, ParameterType, ParameterTypeRegistry }: ExpressionsModule = createRequire(
	require.resolve('@cucumber/cucumber')
)('@cucumber/cucumber-expressions');

/** Bumped when the on-disk shape changes; an index of another format is ignored and rebuilt. */
const INDEX_FORMAT = 1;

/** A step pattern as stored: `[source, flags]` for a regular expression, `[expression, null]` for a Cucumber expression. */
export type StoredPattern = [string, string | null];

/** `[mtimeMs, size]` of a file, or `[-1, -1]` when it could not be stat'd. */
type Stamp = [number, number];

const MISSING_STAMP: Stamp = [-1, -1];

interface IndexEntry {
	/** Indexes into `IndexFile.files` of every project module the file loads, itself first. */
	deps: number[];
	/** Step patterns registered while the file loaded. */
	steps: StoredPattern[];
	/** Load on every run: the file registered something other than step definitions, or nothing at all. */
	always: boolean;
}

interface StoredParameterType {
	name: string;
	regexps: string[];
	useForSnippets: boolean;
	preferForRegexpMatch: boolean;
}

interface IndexFile {
	v: number;
	/** Every project module any entry depends on, canonical paths. */
	files: string[];
	/** Stamp of `files[i]` when its dependents were last loaded. */
	stamps: Stamp[];
	/** By canonical support-file path. */
	entries: Record<string, IndexEntry>;
	/** Parameter types the support code defines beyond the built-in ones, needed to compile the patterns. */
	parameterTypes: StoredParameterType[];
}

/** An indexed step pattern ready to match, with every support file that registered it. */
interface CompiledPattern {
	/**
	 * The expression's compiled regular expression. Only whether a text matches is needed here, and
	 * `Expression.match()` also builds the argument objects for every hit, which on a whole suite costs
	 * several times the matching itself.
	 */
	regexp: RegExp;
	/** Literal text a matching step must start with ('' when unknown); see `literalPrefix` */
	prefix: string;
	keys: string[];
}

function matches({ regexp }: CompiledPattern, text: string): boolean {
	// A global or sticky regexp remembers where its last match ended; matching always starts at 0 here
	if (regexp.global || regexp.sticky) regexp.lastIndex = 0;
	return regexp.test(text);
}

/** What `runCucumber` should load. */
export interface SelectiveLoadPlan {
	requirePaths: string[];
	importPaths: string[];
	/** Support files the plan leaves unloaded. */
	skipped: number;
	/** Set when every file is being loaded: why. */
	reason?: string;
}

export function storedPattern(pattern: string | RegExp): StoredPattern {
	return typeof pattern === 'string' ? [pattern, null] : [pattern.source, pattern.flags];
}

export function patternKey([source, flags]: StoredPattern): string {
	// A regular expression without flags and a Cucumber expression with the same text are different patterns
	return `${flags === null ? 'e' : `r${flags}`}\0${source}`;
}

/**
 * The literal text every match of the pattern must start with, or '' when there is none that can be relied
 * on. Used to skip the expression match for step texts that cannot match; it must never exclude a text the
 * expression would accept, so anything doubtful yields ''.
 *
 * A Cucumber expression matches its text literally up to the first parameter `{`, optional `(`, alternation
 * `/` or escape `\`. A regular expression is only anchored when its source starts with `^`; its literal
 * prefix ends at the first metacharacter, and the character before a quantifier is dropped since the
 * quantifier may make it optional. Case-insensitive regexps and any source containing `|` (alternation,
 * which may apply to the whole pattern) yield ''.
 */
export function literalPrefix([source, flags]: StoredPattern): string {
	if (flags === null) {
		const end = source.search(/[{(/\\]/);
		if (end === -1) return source;
		// Alternation applies to the whole word it sits in, so back up to the space before it
		return source.slice(0, source[end] === '/' ? source.lastIndexOf(' ', end) + 1 : end);
	}
	if (!source.startsWith('^') || flags.includes('i') || source.includes('|')) return '';
	const body = source.slice(1);
	const end = body.search(/[\\^$.?*+()[\]{}]/);
	if (end === -1) return body;
	const quantifier = '?*+{'.includes(body[end]);
	return body.slice(0, quantifier ? Math.max(0, end - 1) : end);
}

function stampOf(file: string): Stamp {
	try {
		const stat = statSync(file);
		return [stat.mtimeMs, stat.size];
	} catch {
		return MISSING_STAMP;
	}
}

/** A support file being loaded, or loaded, in this run. */
interface FileRecord {
	kind: SupportFileKind;
	steps: Map<string, StoredPattern>;
	always: boolean;
	before: BuilderFingerprint;
}

export class SelectiveLoadSession implements SupportLoadRecorder {
	private readonly indexFile: string;
	private previous: IndexFile | undefined;
	private current: FileRecord | undefined;
	private readonly records = new Map<string, FileRecord>();
	private readonly stamps = new Map<string, Stamp>();
	private readonly all: Array<{ path: string; key: string; kind: SupportFileKind }>;
	private readonly removeListener: () => void;

	/**
	 * @param cwd - Working directory of the run, part of the index key
	 * @param coordinates - The support-code coordinates as configured (globs, modules, loaders), part of the index key
	 * @param experimentalDecorators - Decorator mode, part of the index key
	 * @param requirePaths - Every resolved `require` path of the run
	 * @param importPaths - Every resolved `import` path of the run
	 * @param indexDirectory - Where the index files live; `selective-load` under the cache root by default
	 */
	constructor(
		cwd: string,
		coordinates: ISupportCodeCoordinates,
		experimentalDecorators: boolean,
		private readonly requirePaths: string[],
		private readonly importPaths: string[],
		indexDirectory: string = path.join(getCacheRootDirectory(), 'selective-load')
	) {
		const key = createHash('sha256')
			.update(`${INDEX_FORMAT}\0${tsflowVersion}\0${cwd}\0${experimentalDecorators}\0`)
			.update(JSON.stringify(coordinates))
			.digest('hex');
		this.indexFile = path.join(indexDirectory, `${key}.json`);
		this.all = [
			...requirePaths.map(p => ({ path: p, key: canonicalPath(p), kind: 'require' as const })),
			...importPaths.map(p => ({ path: p, key: canonicalPath(p), kind: 'import' as const }))
		];
		this.removeListener = BindingRegistry.instance.addRegistrationListener(binding =>
			this.onBindingRegistered(binding)
		);
	}

	/**
	 * Why selective loading cannot run for these coordinates, or undefined when it can. A loader attached
	 * with `module.register()` runs on Node's loader hooks thread, where the import graph is not visible to
	 * this process, so a skipped file's record could never be validated.
	 */
	static unsupportedReason(coordinates: ISupportCodeCoordinates): string | undefined {
		const asyncLoader = coordinates.loaders.find(loader => loaderHooksMode(loader) === 'async');
		return asyncLoader
			? `the ${describeTranspiler([], [asyncLoader]) ?? asyncLoader} loader runs on Node's loader hooks thread, where imports cannot be tracked`
			: undefined;
	}

	/** A plan that loads everything, for `reason`; this run still records and rewrites the index. */
	fullPlan(reason: string): SelectiveLoadPlan {
		this.previous ??= this.readIndex();
		return { requirePaths: this.requirePaths, importPaths: this.importPaths, skipped: 0, reason };
	}

	/**
	 * Decide which support files the selected `pickles` need. Falls back to loading everything when there
	 * is no index, when a selected step matches no indexed pattern, or when nothing could be skipped.
	 */
	plan(pickles: ReadonlyArray<Pickle>): SelectiveLoadPlan {
		const start = startTimer();
		try {
			return this.computePlan(pickles);
		} catch (error) {
			// The index must never break a run: a malformed entry means a full load and a rewrite
			logger.checkpoint('Selective load plan failed; loading everything', { error: String(error) });
			return this.fullPlan('the index could not be used');
		} finally {
			recordPhase('selective-load:plan', start);
		}
	}

	private computePlan(pickles: ReadonlyArray<Pickle>): SelectiveLoadPlan {
		const index = this.readIndex();
		this.previous = index;
		if (!index) return this.fullPlan('no index yet; this run writes it');

		// Files loaded regardless: new to the index, marked always, or with a changed import graph
		const mustLoad = new Set<string>();
		const indexed: Array<{ key: string; entry: IndexEntry }> = [];
		for (const { key } of this.all) {
			const entry = index.entries[key];
			if (!entry) {
				mustLoad.add(key);
				continue;
			}
			indexed.push({ key, entry });
			if (entry.always || this.isStale(index, entry)) mustLoad.add(key);
		}
		if (mustLoad.size === this.all.length) return this.fullPlan('every support file is new, changed or always loaded');

		// Compile every distinct indexed pattern once (including those of files loading anyway, so a step
		// defined there counts as matched), remembering every file that registered it; a file whose patterns
		// do not compile is loaded regardless
		const factory = new ExpressionFactory(this.parameterTypeRegistry(index));
		const compiled = new Map<string, CompiledPattern>();
		for (const { key, entry } of indexed) {
			try {
				for (const pattern of entry.steps) {
					const id = patternKey(pattern);
					const existing = compiled.get(id);
					if (existing) {
						existing.keys.push(key);
						continue;
					}
					const [source, flags] = pattern;
					compiled.set(id, {
						// The factory returns one of these two classes; the `Expression` interface omits `regexp`
						regexp: (
							factory.createExpression(flags === null ? source : new RegExp(source, flags)) as
								| CucumberExpression
								| RegularExpression
						).regexp,
						prefix: literalPrefix(pattern),
						keys: [key]
					});
				}
			} catch (error) {
				logger.checkpoint('Step pattern did not compile; loading the file', { file: key, error: String(error) });
				mustLoad.add(key);
			}
		}
		// Patterns whose literal prefix contains a whole first word are bucketed by it; the rest (no prefix,
		// or a prefix that ends inside a word, like `cucumber(s)`) are tried for every text.
		const byFirstWord = new Map<string, CompiledPattern[]>();
		const unbucketed: CompiledPattern[] = [];
		for (const pattern of compiled.values()) {
			const space = pattern.prefix.indexOf(' ');
			if (space <= 0) {
				unbucketed.push(pattern);
				continue;
			}
			const word = pattern.prefix.slice(0, space);
			const bucket = byFirstWord.get(word);
			if (bucket) bucket.push(pattern);
			else byFirstWord.set(word, [pattern]);
		}

		// Match every distinct step text once; stop early once nothing is left to skip. A pattern is only
		// executed against texts that start with its literal prefix, which is most of the saving on a full run.
		const texts = new Set<string>();
		for (const pickle of pickles) for (const step of pickle.steps) texts.add(step.text);
		const tryAll = (text: string, patterns: CompiledPattern[]): boolean => {
			let matched = false;
			for (const pattern of patterns) {
				if (pattern.prefix.length > 0 && !text.startsWith(pattern.prefix)) continue;
				if (matches(pattern, text)) {
					matched = true;
					for (const key of pattern.keys) mustLoad.add(key);
				}
			}
			return matched;
		};
		for (const text of texts) {
			if (mustLoad.size === this.all.length) break;
			const space = text.indexOf(' ');
			const bucket = byFirstWord.get(space === -1 ? text : text.slice(0, space)) ?? [];
			const matched = tryAll(text, bucket);
			if (!tryAll(text, unbucketed) && !matched) {
				return this.fullPlan(`"${text}" matches no step definition in the index`);
			}
		}
		if (mustLoad.size === this.all.length) {
			return this.fullPlan('every support file is needed by the selected scenarios');
		}

		const load = ({ key }: { key: string }): boolean => mustLoad.has(key);
		return {
			requirePaths: this.all.filter(f => f.kind === 'require' && load(f)).map(f => f.path),
			importPaths: this.all.filter(f => f.kind === 'import' && load(f)).map(f => f.path),
			skipped: this.all.length - mustLoad.size
		};
	}

	/** `SupportLoadRecorder`: a support file is about to be required or imported. */
	beginFile(file: string, kind: SupportFileKind): void {
		this.current = { kind, steps: new Map(), always: false, before: builderFingerprint() };
		this.records.set(canonicalPath(file), this.current);
	}

	/** `SupportLoadRecorder`: the support file has finished evaluating. */
	endFile(): void {
		const record = this.current;
		if (!record) return;
		this.current = undefined;
		const before = record.before;
		const after = builderFingerprint();
		// Steps registered straight with CucumberJS (no decorator) are only visible on the builder
		for (const config of builderInternals().stepDefinitionConfigs.slice(before.steps)) {
			const pattern = storedPattern(config.pattern);
			record.steps.set(patternKey(pattern), pattern);
		}
		record.always ||= registeredBeyondSteps(before, after) || record.steps.size === 0;
	}

	private onBindingRegistered(binding: StepBinding): void {
		const record = this.current;
		if (!record) return;
		if (binding.bindingType & StepBindingFlags.Hooks) {
			record.always = true;
		} else {
			const pattern = storedPattern(binding.stepPattern);
			record.steps.set(patternKey(pattern), pattern);
		}
	}

	/** Stop recording without writing: the load failed. */
	abort(): void {
		this.removeListener();
		this.current = undefined;
	}

	/**
	 * Write the index: fresh records for the files this run loaded (their import graphs read now), the
	 * validated previous records for the files it skipped, and the parameter types of the finished library.
	 */
	finish(library: SupportCodeLibrary): void {
		this.removeListener();
		const start = startTimer();
		try {
			const files: string[] = [];
			const stamps: Stamp[] = [];
			const fileIds = new Map<string, number>();
			const fileId = (file: string, stamp: Stamp): number => {
				let id = fileIds.get(file);
				if (id === undefined) {
					id = files.length;
					fileIds.set(file, id);
					files.push(file);
					stamps.push(stamp);
				}
				return id;
			};

			const entries: Record<string, IndexEntry> = {};
			const previous = this.previous;
			for (const { path: file, key, kind } of this.all) {
				const record = this.records.get(key);
				if (record) {
					const deps = kind === 'require' ? requiredProjectModules(file) : importedProjectModules(file);
					entries[key] = {
						deps: deps.map(dep => fileId(dep, stampOf(dep))),
						steps: Array.from(record.steps.values()),
						always: record.always
					};
				} else if (previous?.entries[key]) {
					const entry = previous.entries[key];
					entries[key] = { ...entry, deps: entry.deps.map(i => fileId(previous.files[i], previous.stamps[i])) };
				}
			}

			const builtin = new Set(Array.from(new ParameterTypeRegistry().parameterTypes).map(t => t.name));
			const parameterTypes: StoredParameterType[] = [];
			for (const type of library.parameterTypeRegistry.parameterTypes) {
				if (builtin.has(type.name)) continue;
				parameterTypes.push({
					name: type.name ?? '',
					regexps: Array.from(type.regexpStrings),
					useForSnippets: type.useForSnippets !== false,
					preferForRegexpMatch: type.preferForRegexpMatch === true
				});
			}

			this.writeIndex({ v: INDEX_FORMAT, files, stamps, entries, parameterTypes });
		} catch (error) {
			// Best effort: the run has its library already; the next run loads everything and rebuilds the index
			logger.checkpoint('Could not build the selective-load index', { error: String(error) });
		} finally {
			recordPhase('selective-load:index', start);
		}
	}

	private isStale(index: IndexFile, entry: IndexEntry): boolean {
		for (const i of entry.deps) {
			const [mtimeMs, size] = this.stamp(index.files[i]);
			const [indexedMtimeMs, indexedSize] = index.stamps[i];
			if (mtimeMs !== indexedMtimeMs || size !== indexedSize) return true;
		}
		return false;
	}

	private stamp(file: string): Stamp {
		let stamp = this.stamps.get(file);
		if (!stamp) {
			stamp = stampOf(file);
			this.stamps.set(file, stamp);
		}
		return stamp;
	}

	private parameterTypeRegistry(index: IndexFile): InstanceType<typeof ParameterTypeRegistry> {
		const registry = new ParameterTypeRegistry();
		for (const type of index.parameterTypes) {
			if (registry.lookupByTypeName(type.name)) continue;
			registry.defineParameterType(
				new ParameterType(type.name, type.regexps, null, undefined, type.useForSnippets, type.preferForRegexpMatch)
			);
		}
		return registry;
	}

	private readIndex(): IndexFile | undefined {
		let text: string;
		try {
			text = readFileSync(this.indexFile, 'utf8');
		} catch {
			return undefined;
		}
		try {
			const index = JSON.parse(text) as IndexFile;
			if (
				index?.v === INDEX_FORMAT &&
				Array.isArray(index.files) &&
				Array.isArray(index.stamps) &&
				index.files.length === index.stamps.length &&
				index.entries !== null &&
				typeof index.entries === 'object' &&
				Array.isArray(index.parameterTypes)
			) {
				return index;
			}
		} catch {
			// Unreadable: fall through and rebuild it
		}
		logger.checkpoint('Ignoring an unreadable selective-load index', { file: this.indexFile });
		return undefined;
	}

	private writeIndex(index: IndexFile): void {
		const temp = `${this.indexFile}.${process.pid}-${threadId}.tmp`;
		try {
			mkdirSync(path.dirname(this.indexFile), { recursive: true });
			writeFileSync(temp, JSON.stringify(index));
			renameSync(temp, this.indexFile);
		} catch (error) {
			// Best effort, like the transpile cache: the run is unaffected, the next run loads everything again
			logger.checkpoint('Could not write the selective-load index', { file: this.indexFile, error: String(error) });
			try {
				unlinkSync(temp);
			} catch {
				// The temp file was never created
			}
		}
	}
}
