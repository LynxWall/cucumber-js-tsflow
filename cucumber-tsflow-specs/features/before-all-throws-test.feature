@cli-run @before-all @node @node-esm
Feature: A BeforeAll hook that throws

  A test-run hook that throws fails the run before any scenario starts, as
  it does in CucumberJS: the error names the hook's file and line, the
  hook's own message follows as its cause, and the CLI exits with code 1.
  In parallel mode the worker that ran the hook reports the error and
  exits, and the run fails. The "before-all-throws" profile of each
  workspace adds a fixture with a throwing BeforeAll hook to two working
  support files.

  Scenario: In serial mode the hook error ends the run and names the hook
    When I run the "before-all-throws" profile
    Then the error output names "a BeforeAll hook errored, process exiting: src/fixtures/failing/before-all-throws.ts:9"
    And the error output names "the BeforeAll hook failed on purpose"
    And no scenario ran
    And the run exited with code 1

  Scenario: In parallel mode the worker reports the hook error and the run fails
    When I run the "before-all-throws" profile with "--parallel 1"
    Then the error output names "a BeforeAll hook errored on worker 0, process exiting: src/fixtures/failing/before-all-throws.ts:9"
    And the error output names "the BeforeAll hook failed on purpose"
    And no scenario ran
    And the run exited with code 2
