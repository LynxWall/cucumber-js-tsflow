@cli-run @syntax-error @node-esm
Feature: Support files that do not compile under a loader configured directly

  A "loader" configured by the project, such as ts-node-maintained/esm, runs on
  Node's loader hooks thread, and an error class of its own does not survive
  the crossing: the CLI receives an empty object with no prototype. The CLI
  cannot recover the diagnostic, but it names the support file it was
  importing and exits with code 1. Only the "ts-node-esm" transpiler, whose
  loader is tsflow's own, carries the diagnostic across (see the
  syntax-error feature).

  Scenario: The CLI names the support file when the loader's error arrives empty
    Given a generated support file "src/fixtures/failing/generated/syntax-error.ts" with a syntax error
    When I run the "syntax-error-raw-loader" profile
    Then the load phase failed
    And the error output names "Failed to import support file"
    And the error output names "src/fixtures/failing/generated/syntax-error.ts"
    And the run exited with code 1
