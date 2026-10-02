@cli-run @syntax-error @node @node-esm
Feature: Support files that do not compile

  A support file with a syntax error fails the load phase: the error names
  the file and the CLI exits with code 1, whichever transpiler is in use. The
  broken file is written by the scenario and removed afterwards, so it never
  sits in the tree for an editor to flag. The esbuild transpilers report the
  file, line and column once; the ts-node transpilers report TypeScript's own
  diagnostic, which the "ts-node-esm" loader rebuilds as a plain Error before
  it crosses from Node's loader hooks thread.

  Scenario: Under the esbuild transpiler the error names the file once
    Given a generated support file "src/fixtures/failing/generated/syntax-error.ts" with a syntax error
    When I run the "syntax-error" profile
    Then the load phase failed
    And the error output names "src/fixtures/failing/generated/syntax-error.ts" exactly once
    And the run exited with code 1

  Scenario: Under the ts-node transpiler TypeScript's diagnostic names the file
    Given a generated support file "src/fixtures/failing/generated/syntax-error.ts" with a syntax error
    When I run the "syntax-error-tsnode" profile
    Then the load phase failed
    And the error output names "Unable to compile TypeScript"
    And the error output names "src/fixtures/failing/generated/syntax-error.ts"
    And the run exited with code 1
