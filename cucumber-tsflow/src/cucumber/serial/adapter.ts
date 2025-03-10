import { EventEmitter } from 'node:events'
import { IdGenerator } from '@cucumber/messages'
import { RuntimeAdapter } from '@cucumber/cucumber/lib/runtime/types'
import { AssembledTestCase } from '@cucumber/cucumber/lib/assemble'
import { Worker } from '@cucumber/cucumber/lib/runtime/worker'
import { RuntimeOptions } from '@cucumber/cucumber/lib/runtime/index'
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types'

export class InProcessAdapter implements RuntimeAdapter {
  private readonly worker: Worker
  private failing: boolean = false

  constructor(
    eventBroadcaster: EventEmitter,
    newId: IdGenerator.NewId,
    options: RuntimeOptions,
    supportCodeLibrary: SupportCodeLibrary
  ) {
    this.worker = new Worker(
      undefined,
      eventBroadcaster,
      newId,
      options,
      supportCodeLibrary
    )
  }

  async run(
    assembledTestCases: ReadonlyArray<AssembledTestCase>
  ): Promise<boolean> {
    await this.worker.runBeforeAllHooks()
    for (const item of assembledTestCases) {
      const success = await this.worker.runTestCase(item, this.failing)
      if (!success) {
        this.failing = true
      }
    }
    await this.worker.runAfterAllHooks()
    return !this.failing
  }
}
