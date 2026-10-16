@watch @node @node-esm
Feature: Watch mode after a failing run

  A run whose support code fails to load leaves the session resident: Enter
  runs it again, and quitting ends the process with the exit code of a failed
  run rather than a crash. These scenarios start the CLI with --watch on the
  "missing-import" profile of each workspace, which adds a fixture whose
  import cannot be resolved to two working support files and is also run
  once, without watch, by the load-failure spec.

  Scenario: A run that fails to load can be rerun and quit cleanly
    Given a watch session on the "missing-import" profile with "--watch" has completed its first run
    When I press Enter and wait for the run to finish
    And I quit the watch session
    Then the session ran 2 times
    And every run failed to load the support code
    And the session exited with code 2
    And nothing was printed after the session stopped
