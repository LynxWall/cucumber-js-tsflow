import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import { StepBinding, StepBindingFlags, SerializableBindingDescriptor, serializeBinding } from './step-binding';
import { ContextType, StepPattern, TagName } from './types';
import logger from '../utils/logger';

/**
 * Describes the binding metadata that is associated with a binding class.
 */
interface ClassBinding {
	/**
	 * A reference to the step bindings that are associated with the binding class.
	 */
	stepBindings: StepBinding[];

	/**
	 * The context types that are to be injected into the binding class during execution.
	 */
	contextTypes: ContextType[];
}

/**
 * Represents the default step pattern.
 */
export const DEFAULT_STEP_PATTERN = '/.*/';

/**
 * Represents the default tag.
 */
export const DEFAULT_TAG = '*';

/**
 * A metadata registry that captures information about bindings and their bound step bindings.
 */
export class BindingRegistry {
	private _stepBindings = new Map<StepPattern, Map<TagName, StepBinding[]>>();
	private _classBindings = new Map<any, ClassBinding>();
	private _cucumberKeyIndex = new Map<string, StepBinding>();

	/**
	 * Gets the binding registry singleton.
	 *
	 * @returns A [[BindingRegistry]].
	 */
	public static get instance(): BindingRegistry {
		const BINDING_REGISTRY_SLOTNAME = '__CUCUMBER_TSFLOW_BINDINGREGISTRY';

		const registry = (global as any)[BINDING_REGISTRY_SLOTNAME];

		if (!registry) {
			(global as any)[BINDING_REGISTRY_SLOTNAME] = new BindingRegistry();
		}

		return registry || (global as any)[BINDING_REGISTRY_SLOTNAME];
	}

	/**
	 * Updates the binding registry with information about the context types required by a
	 * binding class.
	 *
	 * @param classPrototype The class representing the binding (constructor function).
	 * @param contextTypes An array of [[ContextType]] that define the types of objects that
	 * should be injected into the binding class during a scenario execution.
	 */
	public registerContextTypesForClass(classPrototype: any, contextTypes?: ContextType[]): void {
		if (!contextTypes) {
			return;
		}

		let targetDecorations = this._classBindings.get(classPrototype);

		if (!targetDecorations) {
			targetDecorations = {
				stepBindings: [],
				contextTypes: []
			};

			this._classBindings.set(classPrototype, targetDecorations);
		}

		targetDecorations.contextTypes = contextTypes;
	}

	/**
	 * Retrieves the context types that have been registered for a given binding class.
	 *
	 * @param classPrototype The class representing the binding (constructor function).
	 *
	 * @returns An array of [[ContextType]] that have been registered for the specified
	 * binding class.
	 */
	public getContextTypesForClass(classPrototype: any): ContextType[] {
		const targetBinding = this._classBindings.get(classPrototype);

		if (!targetBinding) {
			return [];
		}

		return targetBinding.contextTypes;
	}

	/**
	 * Updates the binding registry indexes with a step binding.
	 *
	 * @param stepBinding The step binding that is to be registered with the binding registry.
	 */
	public registerStepBinding(stepBinding: StepBinding): void {
		if (!stepBinding.tags) {
			stepBinding.tags = DEFAULT_TAG;
		}

		if (stepBinding.tags !== DEFAULT_TAG && !stepBinding.tags.startsWith('@')) {
			logger.debug('tag should start with @; tsflow has stopped to automatically prepend @ for you.');
		}

		const stepPattern: StepPattern = stepBinding.stepPattern
			? stepBinding.stepPattern.toString()
			: DEFAULT_STEP_PATTERN;

		let tagMap = this._stepBindings.get(stepPattern);

		if (!tagMap) {
			tagMap = new Map<TagName, StepBinding[]>();
			this._stepBindings.set(stepPattern, tagMap);
		}

		let stepBindings = tagMap.get(stepBinding.tags);

		if (!stepBindings) {
			stepBindings = [];
			tagMap.set(stepBinding.tags, stepBindings);
		}

		if (!stepBindings.some(b => isSameStepBinding(stepBinding, b))) {
			stepBindings.push(stepBinding);
		}

		// Index the step binding for the target
		let targetBinding = this._classBindings.get(stepBinding.classPrototype);

		if (!targetBinding) {
			targetBinding = {
				stepBindings: [],
				contextTypes: []
			};

			this._classBindings.set(stepBinding.classPrototype, targetBinding);
		}

		if (!targetBinding.stepBindings.some(b => isSameStepBinding(stepBinding, b))) {
			targetBinding.stepBindings.push(stepBinding);
		}

		// Index by cucumberKey for O(1) lookup
		this._cucumberKeyIndex.set(stepBinding.cucumberKey, stepBinding);

		function isSameStepBinding(a: StepBinding, b: StepBinding) {
			// For hooks, we need to check the binding type and method name too
			if (a.bindingType & StepBindingFlags.Hooks) {
				return (
					a.callsite.filename === b.callsite.filename &&
					a.callsite.lineNumber === b.callsite.lineNumber &&
					String(a.tags) === String(b.tags) &&
					String(a.stepPattern) === String(b.stepPattern) &&
					a.bindingType === b.bindingType &&
					a.classPropertyKey === b.classPropertyKey
				);
			}

			// For step definitions, the existing check is fine
			return (
				a.callsite.filename === b.callsite.filename &&
				a.callsite.lineNumber === b.callsite.lineNumber &&
				String(a.tags) === String(b.tags) &&
				String(a.stepPattern) === String(b.stepPattern)
			);
		}
	}

	/**
	 * Retrieves the step bindings that have been registered for a given binding class.
	 *
	 * @param targetPrototype The class representing the binding (constructor function).
	 *
	 * @returns An array of [[StepBinding]] objects that have been registered for the specified
	 * binding class.
	 */
	public getStepBindingsForTarget(targetPrototype: any): StepBinding[] {
		const targetBinding = this._classBindings.get(targetPrototype);

		if (!targetBinding) {
			return [];
		}

		return targetBinding.stepBindings;
	}

	/**
	 * Retrieves the step bindings for a given step pattern and collection of tag names.
	 *
	 * @param stepPattern The step pattern to search.
	 * @param tags An array of [[TagName]] to search.
	 *
	 * @returns An array of [[StepBinding]] that map to the given step pattern and set of tag names.
	 */
	public getStepBindings(stepPattern: StepPattern, tags: TagName[]): StepBinding[] {
		const tagMap = this._stepBindings.get(stepPattern);

		if (!tagMap) {
			return [];
		}

		const matchingStepBindings = this.mapTagNamesToStepBindings(tags, tagMap);

		if (matchingStepBindings.length > 0) {
			return matchingStepBindings;
		}

		return this.mapTagNamesToStepBindings(['*'], tagMap);
	}

	public getStepBindingByCucumberKey(cucumberKey: string): StepBinding | undefined {
		return this._cucumberKeyIndex.get(cucumberKey);
	}

	/**
	 * Updates the SupportCodeLibrary from Cucumber with
	 * callsite information from tsflow bindings
	 * @param library
	 * @returns
	 */
	public updateSupportCodeLibrary = (library: SupportCodeLibrary): SupportCodeLibrary => {
		const findByKey = (definitions: any[]) => (cucumberKey: string) =>
			definitions.find(s => (s.options as any).cucumberKey === cucumberKey);

		const lookupMap: Record<number, (key: string) => any> = {
			[StepBindingFlags.beforeAll]: findByKey(library.beforeTestRunHookDefinitions),
			[StepBindingFlags.before]: findByKey(library.beforeTestCaseHookDefinitions),
			[StepBindingFlags.beforeStep]: findByKey(library.beforeTestStepHookDefinitions),
			[StepBindingFlags.given]: findByKey(library.stepDefinitions),
			[StepBindingFlags.when]: findByKey(library.stepDefinitions),
			[StepBindingFlags.then]: findByKey(library.stepDefinitions),
			[StepBindingFlags.afterStep]: findByKey(library.afterTestStepHookDefinitions),
			[StepBindingFlags.after]: findByKey(library.afterTestCaseHookDefinitions),
			[StepBindingFlags.afterAll]: findByKey(library.afterTestRunHookDefinitions)
		};

		this._classBindings.forEach(binding => {
			binding.stepBindings.forEach(stepBinding => {
				const lookup = lookupMap[stepBinding.bindingType];
				const cucumberDefinition = lookup?.(stepBinding.cucumberKey);
				if (cucumberDefinition) {
					cucumberDefinition.line = stepBinding.callsite.lineNumber;
					cucumberDefinition.uri = stepBinding.callsite.filename;
				}
			});
		});
		return library;
	};

	/**
	 * Export all registered step bindings as structured-clone-safe descriptors.
	 * Used by loader-workers to send binding metadata back to the main thread.
	 *
	 * @returns An array of [[SerializableBindingDescriptor]].
	 */
	public toDescriptors(): SerializableBindingDescriptor[] {
		const descriptors: SerializableBindingDescriptor[] = [];
		for (const [, binding] of this._classBindings) {
			for (const stepBinding of binding.stepBindings) {
				descriptors.push(serializeBinding(stepBinding));
			}
		}
		return descriptors;
	}

	/**
	 * Remove all step bindings that originated from a given source file.
	 * This supports delta-aware reload — bindings from changed files are purged
	 * before re-loading so stale entries don't accumulate.
	 *
	 * @param filename Absolute path to the source file whose bindings should be removed.
	 */
	public removeBindingsForFile(filename: string): void {
		// Remove from _stepBindings index
		for (const [pattern, tagMap] of this._stepBindings) {
			for (const [tag, bindings] of tagMap) {
				const filtered = bindings.filter(b => b.callsite.filename !== filename);
				if (filtered.length === 0) {
					tagMap.delete(tag);
				} else {
					tagMap.set(tag, filtered);
				}
			}
			if (tagMap.size === 0) {
				this._stepBindings.delete(pattern);
			}
		}

		// Remove from _cucumberKeyIndex
		for (const [key, binding] of this._cucumberKeyIndex) {
			if (binding.callsite.filename === filename) {
				this._cucumberKeyIndex.delete(key);
			}
		}

		// Remove from _classBindings index
		for (const [proto, classBinding] of this._classBindings) {
			classBinding.stepBindings = classBinding.stepBindings.filter(b => b.callsite.filename !== filename);
			if (classBinding.stepBindings.length === 0 && classBinding.contextTypes.length === 0) {
				this._classBindings.delete(proto);
			}
		}
	}

	/**
	 * Check whether a binding with the given cucumberKey is already registered.
	 *
	 * @param cucumberKey The unique key to check.
	 * @returns true if a binding with that key exists.
	 */
	public hasBindingForKey(cucumberKey: string): boolean {
		return this._cucumberKeyIndex.has(cucumberKey);
	}

	/**
	 * Collect the unique set of source filenames from all registered bindings.
	 * Useful for comparing what was loaded in a worker versus what exists on the main thread.
	 *
	 * @returns A Set of absolute file paths.
	 */
	public getDescriptorSourceFiles(): Set<string> {
		const files = new Set<string>();
		for (const [, binding] of this._classBindings) {
			for (const stepBinding of binding.stepBindings) {
				files.add(stepBinding.callsite.filename);
			}
		}
		return files;
	}

	/**
	 * Maps an array of tag names to an array of associated step bindings.
	 *
	 * @param tags An array of [[TagName]].
	 * @param tagMap The map of [[TagName]] -> [[StepBinding]] to use when mapping.
	 *
	 * @returns An array of [[StepBinding]].
	 */
	private mapTagNamesToStepBindings(tags: TagName[], tagMap: Map<TagName, StepBinding[]>): StepBinding[] {
		return tags.flatMap(tag => tagMap.get(tag) ?? []);
	}
}
