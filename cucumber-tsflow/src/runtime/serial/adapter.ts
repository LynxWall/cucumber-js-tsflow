import { EventEmitter } from 'node:events';
import { IdGenerator, TestStepResultStatus } from '@cucumber/messages';
import { RuntimeAdapter } from '@cucumber/cucumber/lib/runtime/types';
import { AssembledTestCase } from '@cucumber/cucumber/lib/assemble/index';
import { Worker, RunHookResult } from '../worker';
import { RuntimeOptions } from '@cucumber/cucumber/lib/runtime/index';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';

export class InProcessAdapter implements RuntimeAdapter {
	private readonly worker: Worker;
	private failing: boolean = false;

	constructor(
		_testRunStartedId: string,
		eventBroadcaster: EventEmitter,
		newId: IdGenerator.NewId,
		options: RuntimeOptions,
		supportCodeLibrary: SupportCodeLibrary
	) {
		this.worker = new Worker(undefined, eventBroadcaster, newId, options, supportCodeLibrary);
	}

	private hasHookFailure(results: RunHookResult[]): boolean {
		return results.some(r => r.result.status === TestStepResultStatus.FAILED);
	}

	async run(assembledTestCases: ReadonlyArray<AssembledTestCase>): Promise<boolean> {
		const beforeResults = await this.worker.runBeforeAllHooks();
		if (this.hasHookFailure(beforeResults)) {
			this.failing = true;
		}
		for (const item of assembledTestCases) {
			const success = await this.worker.runTestCase(item, this.failing);
			if (!success) {
				this.failing = true;
			}
		}
		const afterResults = await this.worker.runAfterAllHooks();
		if (this.hasHookFailure(afterResults)) {
			this.failing = true;
		}
		return !this.failing;
	}
}
