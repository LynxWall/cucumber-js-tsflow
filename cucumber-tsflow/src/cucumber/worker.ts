import { EventEmitter } from 'node:events'
import { IdGenerator } from '@cucumber/messages'
import { AssembledTestCase } from '@cucumber/cucumber/lib/assemble'
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types'
import TestCaseRunner from '@cucumber/cucumber/lib/runtime/test_case_runner'
import { retriesForPickle, shouldCauseFailure } from '@cucumber/cucumber/lib/runtime/helpers'
import { makeRunTestRunHooks, RunsTestRunHooks } from '@cucumber/cucumber/lib/runtime/run_test_run_hooks'
import { RuntimeOptions } from '@cucumber/cucumber/lib/runtime/index'

export class Worker {
  private readonly runTestRunHooks: RunsTestRunHooks

  constructor(
    private readonly workerId: string | undefined,
    private readonly eventBroadcaster: EventEmitter,
    private readonly newId: IdGenerator.NewId,
    private readonly options: RuntimeOptions,
    private readonly supportCodeLibrary: SupportCodeLibrary
  ) {
    this.runTestRunHooks = makeRunTestRunHooks(
      this.options.dryRun,
      this.supportCodeLibrary.defaultTimeout,
      this.options.worldParameters,
      (name, location) => {
        let message = `${name} hook errored`
        if (this.workerId) {
          message += ` on worker ${this.workerId}`
        }
        message += `, process exiting: ${location}`
        return message
      }
    )
  }

  async runBeforeAllHooks() {
    await this.runTestRunHooks(
      this.supportCodeLibrary.beforeTestRunHookDefinitions,
      'a BeforeAll'
    )
  }

  async runTestCase(
    { gherkinDocument, pickle, testCase }: AssembledTestCase,
    failing: boolean
  ): Promise<boolean> {
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
      worldParameters: this.options.worldParameters,
    })

    const status = await testCaseRunner.run()

    return !shouldCauseFailure(status, this.options)
  }

  async runAfterAllHooks() {
    await this.runTestRunHooks(
      this.supportCodeLibrary.afterTestRunHookDefinitions.slice(0).reverse(),
      'an AfterAll'
    )
  }
}
