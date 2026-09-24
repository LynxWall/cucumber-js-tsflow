@watch @node-esm
Feature: Watch mode with ES modules

  Node cannot evict an ES module, so a rerun re-imports the support files
  that must evaluate again under a cache-busting query. These scenarios
  start the CLI as a child process on a profile of this workspace that sets
  "watch": true, drive it through its stdin, and edit files between runs.
  The fallback scenario's fresh process per run gets --no-watch, which has
  to override the profile. The child runs with the
  loader hooks on its main thread whatever the parent's TSFLOW_ESM_HOOKS
  setting, because the in-process rerun is what the first scenario tests.

  Scenario: Edits rerun the suite in the same process
    Given a watch session on the "watch" profile has completed its first run
    When I press Enter and wait for the run to finish
    And I append a comment to "src/step_definitions/basic-test.ts" and wait for the run to finish
    And I append a comment to "src/fixtures/scenario-context.ts" and wait for the run to finish
    And I quit the watch session
    Then the session ran 4 times
    And the session kept the support code loaded between runs
    And every run reported 3 scenarios passed
    And each rerun evaluated 2 support files again and kept 0 loaded
    And rerun 1 was not triggered by a file change
    And rerun 2 was triggered by a change to "src/step_definitions/basic-test.ts"
    And rerun 2 re-evaluated 0 other modules
    And rerun 3 was triggered by a change to "src/fixtures/scenario-context.ts"
    And rerun 3 re-evaluated 1 other module
    And the session exited with code 0

  Scenario: A loader on the hooks thread falls back to a fresh process per run
    Given a watch session on the "watch-tsnode" profile has completed its first run
    When I append a comment to "src/step_definitions/basic-test.ts" and wait for the run to finish
    And I quit the watch session
    Then the session ran 2 times
    And the session announced that the support code cannot be kept loaded between runs
    And every run reported 3 scenarios passed
    And no rerun note was printed
    And rerun 1 was triggered by a change to "src/step_definitions/basic-test.ts"
    And the session exited with code 0

  Scenario: Reported step locations follow an edit
    The decorators of a re-evaluated support file resolve their callsites
    again, so a rerun must report the lines of the file as it is now, not
    the lines of the version the process first loaded.

    Given a watch session on the "watch" profile with "--format message:../reports/watch-locations-esm.ndjson" has completed its first run
    Then every step definition reported to "../reports/watch-locations-esm.ndjson" for "src/step_definitions/basic-test.ts" points at the line of its decorator
    When I record the step definitions reported to "../reports/watch-locations-esm.ndjson" for "src/step_definitions/basic-test.ts"
    And I insert 3 comment lines at the top of "src/step_definitions/basic-test.ts" and wait for the run to finish
    Then every step definition reported to "../reports/watch-locations-esm.ndjson" for "src/step_definitions/basic-test.ts" points at the line of its decorator
    And the step definitions reported to "../reports/watch-locations-esm.ndjson" for "src/step_definitions/basic-test.ts" are 3 lines further down than recorded
    When I quit the watch session
    Then the session exited with code 0
