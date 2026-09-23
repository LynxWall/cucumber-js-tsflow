@watch @node
Feature: Watch mode

  With --watch the CLI stays running after the first run and runs again
  when Enter is pressed, keeping the support code loaded between runs.
  These scenarios start the CLI as a child process on the "watch" profile
  of this workspace and drive it through its stdin.

  Scenario: Enter reruns the suite in the same process
    Given a watch session on the "watch" profile has completed its first run
    When I press Enter and wait for the run to finish
    And I press Enter and wait for the run to finish
    And I quit the watch session
    Then the session ran 3 times
    And every run reported 3 scenarios passed
    And each rerun evaluated 2 support files again and kept 0 loaded
    And the session exited with code 0

  Scenario: Edits rerun the suite in the same process
    Given a watch session on the "watch" profile has completed its first run
    When I append a comment to "src/step_definitions/basic-test.ts" and wait for the run to finish
    And I append a comment to "src/fixtures/scenario-context.ts" and wait for the run to finish
    And I quit the watch session
    Then the session ran 3 times
    And the session kept the support code loaded between runs
    And every run reported 3 scenarios passed
    And each rerun evaluated 2 support files again and kept 0 loaded
    And rerun 1 was triggered by a change to "src/step_definitions/basic-test.ts"
    And rerun 1 re-evaluated 0 other modules
    And rerun 2 was triggered by a change to "src/fixtures/scenario-context.ts"
    And rerun 2 re-evaluated 1 other module
    And the session exited with code 0
