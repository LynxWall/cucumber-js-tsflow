import { EventEmitter } from 'node:events';
import * as messages from '@cucumber/messages';
import { IdGenerator } from '@cucumber/messages';
import { AssembledTestCase } from '@cucumber/cucumber/lib/assemble/index';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import TestCaseRunner from './test-case-runner';
import { retriesForPickle, shouldCauseFailure } from '@cucumber/cucumber/lib/runtime/helpers';
import { RuntimeOptions } from '@cucumber/cucumber/lib/runtime/index';

/** Result of running a single test-run hook */
export interface RunHookResult {
	result: messages.TestStepResult;
	error?: any;
}

export class Worker {
	constructor(
		private readonly workerId: string | undefined,
		private readonly eventBroadcaster: EventEmitter,
		private readonly newId: IdGenerator.NewId,
		private readonly options: RuntimeOptions,
		private readonly supportCodeLibrary: SupportCodeLibrary
	) {}

	async runBeforeAllHooks(): Promise<RunHookResult[]> {
		const results: RunHookResult[] = [];
		for (const hookDefinition of this.supportCodeLibrary.beforeTestRunHookDefinitions) {
			const result = await this.runTestRunHook(hookDefinition, 'a BeforeAll');
			results.push(result);
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

	async runAfterAllHooks(): Promise<RunHookResult[]> {
		const results: RunHookResult[] = [];
		const hooks = this.supportCodeLibrary.afterTestRunHookDefinitions.slice(0).reverse();
		for (const hookDefinition of hooks) {
			const result = await this.runTestRunHook(hookDefinition, 'an AfterAll');
			results.push(result);
		}
		return results;
	}

	/**
	 * Run a single test-run hook (BeforeAll/AfterAll).
	 * Replicates the logic previously in makeRunTestRunHooks which was removed
	 * from Cucumber 12.3+.
	 */
	private async runTestRunHook(hookDefinition: any, name: string): Promise<RunHookResult> {
		if (this.options.dryRun) {
			return {
				result: {
					status: messages.TestStepResultStatus.SKIPPED,
					duration: { seconds: 0, nanos: 0 }
				}
			};
		}

		try {
			await hookDefinition.code.apply(null, []);
			return {
				result: {
					status: messages.TestStepResultStatus.PASSED,
					duration: { seconds: 0, nanos: 0 }
				}
			};
		} catch (error: any) {
			let errorMessage = `${name} hook errored`;
			if (this.workerId) {
				errorMessage += ` on worker ${this.workerId}`;
			}
			const location = `${hookDefinition.uri}:${hookDefinition.line}`;
			errorMessage += `, process exiting: ${location}`;

			return {
				result: {
					status: messages.TestStepResultStatus.FAILED,
					duration: { seconds: 0, nanos: 0 },
					message: error.message || errorMessage,
					exception: {
						type: error.constructor?.name || 'Error',
						message: error.message || errorMessage
					}
				},
				error
			};
		}
	}
}
