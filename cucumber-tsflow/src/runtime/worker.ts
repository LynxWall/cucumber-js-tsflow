import { EventEmitter } from 'node:events';
import * as messages from '@cucumber/messages';
import { IdGenerator } from '@cucumber/messages';
import { AssembledTestCase } from '@cucumber/cucumber/lib/assemble/index';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import TestRunHookDefinition from '@cucumber/cucumber/lib/models/test_run_hook_definition';
import UserCodeRunner from '@cucumber/cucumber/lib/user_code_runner';
import { formatError } from '@cucumber/cucumber/lib/runtime/format_error';
import { formatLocation } from '@cucumber/cucumber/lib/formatter/helpers/location_helpers';
import { runInTestRunScope } from '@cucumber/cucumber/lib/runtime/scope/index';
import { create as createStopwatch, timestamp } from '@cucumber/cucumber/lib/runtime/stopwatch';
import { doesHaveValue } from '@cucumber/cucumber/lib/value_checker';
import TestCaseRunner from './test-case-runner';
import { retriesForPickle, shouldCauseFailure } from '@cucumber/cucumber/lib/runtime/helpers';
import { RuntimeOptions } from '@cucumber/cucumber/lib/runtime/index';

/** Result of running a single test-run hook */
export interface RunHookResult {
	result: messages.TestStepResult;
	/** Set when the hook threw: `a BeforeAll hook errored, process exiting: <uri>:<line>`, with the hook's error as its cause */
	error?: Error;
}

export class Worker {
	constructor(
		private readonly testRunStartedId: string,
		private readonly workerId: string | undefined,
		private readonly eventBroadcaster: EventEmitter,
		private readonly newId: IdGenerator.NewId,
		private readonly options: RuntimeOptions,
		private readonly supportCodeLibrary: SupportCodeLibrary
	) {}

	/** Run the BeforeAll hooks in order; the first one that throws ends the run with its wrapped error. */
	async runBeforeAllHooks(): Promise<RunHookResult[]> {
		const results: RunHookResult[] = [];
		for (const hookDefinition of this.supportCodeLibrary.beforeTestRunHookDefinitions) {
			const result = await this.runTestRunHook(hookDefinition, 'a BeforeAll');
			results.push(result);
			if (result.error) throw result.error;
		}
		return results;
	}

	async runTestCase({ gherkinDocument, pickle, testCase }: AssembledTestCase, failing: boolean): Promise<boolean> {
		const testCaseRunner = new TestCaseRunner({
			workerId: this.workerId,
			eventBroadcaster: this.eventBroadcaster,
			newId: this.newId,
			gherkinDocument,
			pickle,
			testCase,
			retries: retriesForPickle(pickle, this.options),
			skip: this.options.dryRun || (this.options.failFast && failing),
			filterStackTraces: this.options.filterStacktraces,
			supportCodeLibrary: this.supportCodeLibrary,
			worldParameters: this.options.worldParameters
		});

		const status = await testCaseRunner.run();

		return !shouldCauseFailure(status, this.options);
	}

	/** Run the AfterAll hooks in reverse order; the first one that throws ends the run with its wrapped error. */
	async runAfterAllHooks(): Promise<RunHookResult[]> {
		const results: RunHookResult[] = [];
		const hooks = this.supportCodeLibrary.afterTestRunHookDefinitions.slice(0).reverse();
		for (const hookDefinition of hooks) {
			const result = await this.runTestRunHook(hookDefinition, 'an AfterAll');
			results.push(result);
			if (result.error) throw result.error;
		}
		return results;
	}

	/**
	 * Run a single test-run hook (BeforeAll/AfterAll) the way CucumberJS's own worker does: a `testRunHookStarted`
	 * envelope, the hook under its timeout and in the test-run scope (so the `context` proxy works inside it), a
	 * `testRunHookFinished` envelope with the timed result, and, when the hook threw, an error naming the hook's
	 * location for the caller to end the run with.
	 */
	private async runTestRunHook(hookDefinition: TestRunHookDefinition, name: string): Promise<RunHookResult> {
		const testRunHookStartedId = this.newId();
		this.eventBroadcaster.emit('envelope', {
			testRunHookStarted: {
				testRunStartedId: this.testRunStartedId,
				workerId: this.workerId,
				id: testRunHookStartedId,
				hookId: hookDefinition.id,
				timestamp: timestamp()
			}
		} satisfies messages.Envelope);

		let result: messages.TestStepResult;
		let error: Error | undefined;
		if (this.options.dryRun) {
			result = {
				status: messages.TestStepResultStatus.SKIPPED,
				duration: { seconds: 0, nanos: 0 }
			};
		} else {
			const stopwatch = createStopwatch().start();
			const context = { parameters: this.options.worldParameters };
			const { error: thrown } = await runInTestRunScope({ context }, () =>
				UserCodeRunner.run({
					argsArray: [],
					fn: hookDefinition.code,
					thisArg: context,
					timeoutInMilliseconds: hookDefinition.options.timeout ?? this.supportCodeLibrary.defaultTimeout
				})
			);
			const duration = stopwatch.stop().duration();
			if (doesHaveValue(thrown)) {
				result = {
					status: messages.TestStepResultStatus.FAILED,
					duration,
					...formatError(thrown, this.options.filterStacktraces)
				};
				let message = `${name} hook errored`;
				if (this.workerId) {
					message += ` on worker ${this.workerId}`;
				}
				message += `, process exiting: ${formatLocation(hookDefinition)}`;
				error = new Error(message, { cause: thrown });
			} else {
				result = {
					status: messages.TestStepResultStatus.PASSED,
					duration
				};
			}
		}

		this.eventBroadcaster.emit('envelope', {
			testRunHookFinished: {
				testRunHookStartedId,
				result,
				timestamp: timestamp()
			}
		} satisfies messages.Envelope);

		return { result, error };
	}
}
