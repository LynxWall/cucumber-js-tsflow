import { getAmbiguousStepException } from '@cucumber/cucumber/lib/runtime/helpers';
import type { INewTestCaseRunnerOptions as ICucumberTestCaseRunnerOptions } from '@cucumber/cucumber/lib/runtime/test_case_runner';
import AttachmentManager, { ICreateAttachment } from '@cucumber/cucumber/lib/runtime/attachment_manager/index';

/** Local options interface — omits snippetBuilder which our runner doesn't use */
type INewTestCaseRunnerOptions = Omit<ICucumberTestCaseRunnerOptions, 'snippetBuilder'>;
import StepRunner, { RunStepResult } from '@cucumber/cucumber/lib/runtime/step_runner';
import * as messages from '@cucumber/messages';
import { getWorstTestStepResult, IdGenerator } from '@cucumber/messages';
import { EventEmitter } from 'events';
import {
	SupportCodeLibrary,
	ITestCaseHookParameter,
	ITestStepHookParameter
} from '@cucumber/cucumber/lib/support_code_library_builder/types';
import TestCaseHookDefinition from '@cucumber/cucumber/lib/models/test_case_hook_definition';
import TestStepHookDefinition from '@cucumber/cucumber/lib/models/test_step_hook_definition';
import { IDefinition } from '@cucumber/cucumber/lib/models/definition';
import { doesHaveValue, doesNotHaveValue } from '@cucumber/cucumber/lib/value_checker';
import StepDefinition from '@cucumber/cucumber/lib/models/step_definition';
import { BindingRegistry } from '../bindings/binding-registry';
import { StepBinding } from '../bindings/step-binding';
import { ManagedScenarioContext } from './managed-scenario-context';
import { EndTestCaseInfo, StartTestCaseInfo } from './test-case-info';
import { IWorldOptions } from '@cucumber/cucumber/lib/support_code_library_builder/world';
import { timestamp } from '@cucumber/cucumber/lib/runtime/stopwatch';

export default class TestCaseRunner {
	private readonly workerId: string | undefined;
	private readonly attachmentManager: AttachmentManager;
	private currentTestCaseStartedId?: string;
	private currentTestStepId?: string;
	private readonly eventBroadcaster: EventEmitter;
	private readonly gherkinDocument: messages.GherkinDocument;
	private readonly newId: IdGenerator.NewId;
	private readonly pickle: messages.Pickle;
	private readonly testCase: messages.TestCase;
	private readonly maxAttempts: number;
	private readonly skip: boolean;
	private readonly filterStackTraces: boolean;
	private readonly supportCodeLibrary: SupportCodeLibrary;
	private readonly definitionIndex: DefinitionIndex;
	private readonly beforeStepHookDefinitions: TestStepHookDefinition[];
	private readonly afterStepHookDefinitions: TestStepHookDefinition[];
	private testStepResults?: messages.TestStepResult[];
	private world: any;
	private readonly worldParameters: any;
	private bindingRegistry: BindingRegistry;

	constructor({
		workerId,
		eventBroadcaster,
		gherkinDocument,
		newId,
		pickle,
		testCase,
		retries = 0,
		skip,
		filterStackTraces,
		supportCodeLibrary,
		worldParameters
	}: INewTestCaseRunnerOptions) {
		this.workerId = workerId;
		this.attachmentManager = new AttachmentManager(({ data, media, fileName }) => {
			if (doesNotHaveValue(this.currentTestStepId)) {
				throw new Error(
					'Cannot attach when a step/hook is not running. Ensure your step/hook waits for the attach to finish.'
				);
			}
			const attachment: messages.Envelope = {
				attachment: {
					body: data,
					contentEncoding: media.encoding,
					mediaType: media.contentType,
					fileName,
					testCaseStartedId: this.currentTestCaseStartedId,
					testStepId: this.currentTestStepId
				}
			};
			this.eventBroadcaster.emit('envelope', attachment);
		});
		this.eventBroadcaster = eventBroadcaster;
		this.gherkinDocument = gherkinDocument;
		this.maxAttempts = 1 + (skip ? 0 : retries);
		this.newId = newId;
		this.pickle = pickle;
		this.testCase = testCase;
		this.skip = skip;
		this.filterStackTraces = filterStackTraces;
		this.supportCodeLibrary = supportCodeLibrary;
		this.worldParameters = worldParameters;
		this.resetTestProgressData();
		this.bindingRegistry = BindingRegistry.instance;
		this.definitionIndex = getDefinitionIndex(supportCodeLibrary);
		// The pickle is fixed for the runner's lifetime, so the step hooks that apply
		// to it can be selected once here rather than on every step.
		this.beforeStepHookDefinitions = supportCodeLibrary.beforeTestStepHookDefinitions.filter(hookDefinition =>
			hookDefinition.appliesToTestCase(this.pickle)
		);
		this.afterStepHookDefinitions = supportCodeLibrary.afterTestStepHookDefinitions
			.slice(0)
			.reverse()
			.filter(hookDefinition => hookDefinition.appliesToTestCase(this.pickle));
	}

	resetTestProgressData(): void {
		this.world = new this.supportCodeLibrary.World({
			attach: this.attachmentManager.create.bind(this.attachmentManager) as unknown as ICreateAttachment,
			log: this.attachmentManager.log.bind(this.attachmentManager),
			link: this.attachmentManager.link.bind(this.attachmentManager),
			parameters: structuredClone(this.worldParameters)
		} satisfies IWorldOptions);
		this.testStepResults = [];
	}

	getBeforeStepHookDefinitions(): TestStepHookDefinition[] {
		return this.beforeStepHookDefinitions;
	}

	getAfterStepHookDefinitions(): TestStepHookDefinition[] {
		return this.afterStepHookDefinitions;
	}

	getWorstStepResult(): messages.TestStepResult {
		if (!this.testStepResults || this.testStepResults.length === 0) {
			return {
				status: this.skip ? messages.TestStepResultStatus.SKIPPED : messages.TestStepResultStatus.PASSED,
				duration: messages.TimeConversion.millisecondsToDuration(0)
			};
		}
		return getWorstTestStepResult(this.testStepResults);
	}

	/**
	 * Run a step or a hook through CucumberJS's `StepRunner`. Its options declare both `step` and `hookParameter`
	 * as required, but a step definition reads only the step and a hook definition only the hook parameter, so a
	 * hook passes `null` for the step and a step passes no hook parameter, as CucumberJS's own runner does.
	 */
	async invokeStep(
		step: messages.PickleStep | null,
		stepDefinition: IDefinition,
		hookParameter?: ITestCaseHookParameter
	): Promise<RunStepResult> {
		return await StepRunner.run({
			defaultTimeout: this.supportCodeLibrary.defaultTimeout,
			filterStackTraces: this.filterStackTraces,
			hookParameter: hookParameter as ITestCaseHookParameter,
			step: step as messages.PickleStep,
			stepDefinition,
			world: this.world
		});
	}

	isSkippingSteps(): boolean {
		return this.getWorstStepResult().status !== messages.TestStepResultStatus.PASSED;
	}

	shouldSkipHook(isBeforeHook: boolean): boolean {
		return this.skip || (this.isSkippingSteps() && isBeforeHook);
	}

	async aroundTestStep(testStepId: string, runStepFn: () => Promise<messages.TestStepResult>): Promise<void> {
		const testStepStarted: messages.Envelope = {
			testStepStarted: {
				testCaseStartedId: this.currentTestCaseStartedId!,
				testStepId,
				timestamp: timestamp()
			}
		};
		this.eventBroadcaster.emit('envelope', testStepStarted);
		this.currentTestStepId = testStepId;
		const testStepResult = await runStepFn();
		this.currentTestStepId = undefined;
		this.testStepResults?.push(testStepResult);
		const testStepFinished: messages.Envelope = {
			testStepFinished: {
				testCaseStartedId: this.currentTestCaseStartedId!,
				testStepId,
				testStepResult,
				timestamp: timestamp()
			}
		};
		this.eventBroadcaster.emit('envelope', testStepFinished);
	}

	async run(): Promise<messages.TestStepResultStatus> {
		for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
			const moreAttemptsRemaining = attempt + 1 < this.maxAttempts;

			const willBeRetried = await this.runAttempt(attempt, moreAttemptsRemaining);

			if (!willBeRetried) {
				break;
			}
			this.resetTestProgressData();
		}
		return this.getWorstStepResult().status;
	}

	async runAttempt(attempt: number, moreAttemptsRemaining: boolean): Promise<boolean> {
		this.currentTestCaseStartedId = this.newId();
		const testCaseStarted: messages.TestCaseStarted = {
			attempt,
			testCaseId: this.testCase.id,
			id: this.currentTestCaseStartedId,
			timestamp: timestamp()
		};
		if (this.workerId) {
			testCaseStarted.workerId = this.workerId;
		}
		const testCaseStartedEnvelope: messages.Envelope = { testCaseStarted };
		this.eventBroadcaster.emit('envelope', testCaseStartedEnvelope);
		// used to determine whether a hook is a Before or After
		let didWeRunStepsYet = false;
		for (const testStep of this.testCase.testSteps) {
			await this.aroundTestStep(testStep.id, async () => {
				if (doesHaveValue(testStep.hookId)) {
					const hookParameter: ITestCaseHookParameter = {
						gherkinDocument: this.gherkinDocument,
						pickle: this.pickle,
						testCaseStartedId: this.currentTestCaseStartedId!
					};
					if (didWeRunStepsYet) {
						hookParameter.result = this.getWorstStepResult();
						hookParameter.willBeRetried =
							this.getWorstStepResult().status === messages.TestStepResultStatus.FAILED && moreAttemptsRemaining;
					}
					return await this.runHook(
						this.definitionIndex.hooksById.get(testStep.hookId!)!,
						hookParameter,
						!didWeRunStepsYet
					);
				} else {
					const pickleStep = this.pickle.steps.find(pickleStep => pickleStep.id === testStep.pickleStepId);
					const testStepResult = await this.runStep(pickleStep!, testStep);
					didWeRunStepsYet = true;
					return testStepResult;
				}
			});
		}
		const worseResult = this.getWorstStepResult();
		const willBeRetried = worseResult.status === messages.TestStepResultStatus.FAILED && moreAttemptsRemaining;

		const endTestCaseParameter: EndTestCaseInfo = {
			gherkinDocument: this.gherkinDocument,
			pickle: this.pickle,
			testCaseStartedId: this.currentTestCaseStartedId!,
			result: worseResult,
			willBeRetried: willBeRetried
		};

		// End test case will call dispose on all context types
		// passed into a binding and then end the context.
		await global.messageCollector.endTestCase(endTestCaseParameter);

		const testCaseFinished: messages.Envelope = {
			testCaseFinished: {
				testCaseStartedId: this.currentTestCaseStartedId,
				timestamp: timestamp(),
				willBeRetried
			}
		};
		this.eventBroadcaster.emit('envelope', testCaseFinished);

		return willBeRetried;
	}

	async runHook(
		hookDefinition: TestCaseHookDefinition,
		hookParameter: ITestCaseHookParameter,
		isBeforeHook: boolean
	): Promise<messages.TestStepResult> {
		if (this.shouldSkipHook(isBeforeHook)) {
			return {
				status: messages.TestStepResultStatus.SKIPPED,
				duration: messages.TimeConversion.millisecondsToDuration(0)
			};
		}

		// Get the step binding and scenario context so that we can
		// initialize any context objects before hooks are executed
		const stepBinding = this.bindingRegistry.getStepBindingByCucumberKey((hookDefinition.options as any).cucumberKey);
		if (!stepBinding) throw new Error('===268 test-case-runner.ts Unable to find StepBinding!');
		const scenarioContext = global.messageCollector.getHookScenarioContext(hookParameter);
		if (!scenarioContext) throw new Error('Unable to find the ManagedScenarioContext!');
		await this.initializeContext(stepBinding, scenarioContext);

		const { result } = await this.invokeStep(null, hookDefinition, hookParameter);
		return result;
	}

	async runStepHooks(
		stepHooks: TestStepHookDefinition[],
		pickleStep: messages.PickleStep,
		stepResult?: messages.TestStepResult
	): Promise<messages.TestStepResult[]> {
		const stepHooksResult = [];
		const hookParameter: ITestStepHookParameter = {
			gherkinDocument: this.gherkinDocument,
			pickle: this.pickle,
			pickleStep,
			testCaseStartedId: this.currentTestCaseStartedId!,
			testStepId: this.currentTestStepId!,
			result: stepResult!
		};
		for (const stepHookDefinition of stepHooks) {
			const { result } = await this.invokeStep(null, stepHookDefinition, hookParameter);
			stepHooksResult.push(result);
		}
		return stepHooksResult;
	}

	async runStep(pickleStep: messages.PickleStep, testStep: messages.TestStep): Promise<messages.TestStepResult> {
		const stepDefinitions = testStep.stepDefinitionIds?.map(stepDefinitionId => {
			return this.definitionIndex.stepsById.get(stepDefinitionId)!;
		});

		if (!stepDefinitions || stepDefinitions.length === 0) {
			return {
				status: messages.TestStepResultStatus.UNDEFINED,
				duration: messages.TimeConversion.millisecondsToDuration(0)
			};
		} else if (stepDefinitions.length > 1) {
			return {
				message: getAmbiguousStepException(stepDefinitions),
				status: messages.TestStepResultStatus.AMBIGUOUS,
				duration: messages.TimeConversion.millisecondsToDuration(0)
			};
		} else if (this.isSkippingSteps()) {
			return {
				status: messages.TestStepResultStatus.SKIPPED,
				duration: messages.TimeConversion.millisecondsToDuration(0)
			};
		}
		// Get the step binding and scenario context so that we can
		// initialize any context objects before hooks are executed
		const stepBinding = this.bindingRegistry.getStepBindingByCucumberKey(
			(stepDefinitions[0].options as any).cucumberKey
		);
		if (!stepBinding) throw new Error('===323 test-case-runner.ts: Unable to find StepBinding!');
		const scenarioContext = global.messageCollector.getStepScenarioContext();
		if (!scenarioContext) throw new Error('Unable to find the ManagedScenarioContext!');
		await this.initializeContext(stepBinding, scenarioContext);

		// next execute any before step hooks followed by the step if there are no
		// failures in before step hooks.
		let stepResult;
		let stepResults = await this.runStepHooks(this.getBeforeStepHookDefinitions(), pickleStep);
		if (getWorstTestStepResult(stepResults).status !== messages.TestStepResultStatus.FAILED) {
			const { result } = await this.invokeStep(pickleStep, stepDefinitions[0]);
			stepResult = result;
			stepResults.push(stepResult);
		}
		// run the after step hooks
		const afterStepHookResults = await this.runStepHooks(this.getAfterStepHookDefinitions(), pickleStep, stepResult);
		stepResults = stepResults.concat(afterStepHookResults);

		const finalStepResult = getWorstTestStepResult(stepResults);
		let finalDuration = messages.TimeConversion.millisecondsToDuration(0);
		for (const result of stepResults) {
			finalDuration = messages.TimeConversion.addDurations(finalDuration, result.duration);
		}
		finalStepResult.duration = finalDuration;
		return finalStepResult;
	}

	/**
	 * Helper used to initialize any context types that are passed into
	 * a binding class before any hooks or steps are executed.
	 * @param stepBinding
	 * @param scenarioContext
	 */
	async initializeContext(stepBinding: StepBinding, scenarioContext: ManagedScenarioContext): Promise<void> {
		const contextTypes = this.bindingRegistry.getContextTypesForClass(stepBinding.classPrototype);
		if (contextTypes.length > 0) {
			scenarioContext.getOrActivateBindingClass(stepBinding.classPrototype, contextTypes, this.world);

			const startTestCaseParameter: StartTestCaseInfo = {
				gherkinDocument: this.gherkinDocument,
				pickle: this.pickle,
				testCaseStartedId: this.currentTestCaseStartedId!
			};
			await scenarioContext.initialize(startTestCaseParameter);
		}
	}
}

/**
 * Per-library indexes of the definitions a test case runner looks up by id.
 */
interface DefinitionIndex {
	hooksById: Map<string, TestCaseHookDefinition>;
	stepsById: Map<string, StepDefinition>;
}

/**
 * Indexes built once per support code library object. A library comes out of
 * `supportCodeLibraryBuilder.finalize()` with fresh definition arrays that are never
 * mutated afterwards, so an index keyed on the library's identity stays valid for as
 * long as that library is in use; a reload produces a new library and a new index.
 */
const definitionIndexes = new WeakMap<SupportCodeLibrary, DefinitionIndex>();

function getDefinitionIndex(supportCodeLibrary: SupportCodeLibrary): DefinitionIndex {
	let index = definitionIndexes.get(supportCodeLibrary);
	if (!index) {
		index = {
			hooksById: indexById([
				...supportCodeLibrary.beforeTestCaseHookDefinitions,
				...supportCodeLibrary.afterTestCaseHookDefinitions
			]),
			stepsById: indexById(supportCodeLibrary.stepDefinitions)
		};
		definitionIndexes.set(supportCodeLibrary, index);
	}
	return index;
}

function indexById<T extends { id: string }>(definitions: T[]): Map<string, T> {
	const index = new Map<string, T>();
	for (const definition of definitions) {
		index.set(definition.id, definition);
	}
	return index;
}
