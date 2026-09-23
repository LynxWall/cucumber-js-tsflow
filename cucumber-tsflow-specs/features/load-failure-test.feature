@cli-run @load-failure @node @node-esm
Feature: Support files that fail to load

  When a support file cannot be loaded the load phase closes as failed, the
  startup progress shuts down, the error is reported once and names the
  file, and the CLI exits with code 1. The "missing-import" profile of each
  workspace adds a fixture whose import cannot be resolved to two working
  support files.

  Scenario: A support file whose import cannot be resolved fails the run and is named once
    When I run the "missing-import" profile
    Then the load phase failed
    And the error output names "src/fixtures/failing/missing-import.ts"
    And the error output names "src/fixtures/failing/missing-import.ts" exactly once
    And the standard output holds no escape sequences
    And the run exited with code 1
