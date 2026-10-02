@reload @node @node-exp
Feature: Reload Support

  Tests for the loadSupport and reloadSupport API, driven in a process of
  their own (src/fixtures/reload-driver.ts) the way a persistent worker
  process uses them. A load replaces the process's bindings, so the suite
  running these scenarios cannot call the API in its own process.

  Scenario: Load support produces a valid library
    Given a process that loads the reload fixtures through the API
    When it calls loadSupport
    Then the library should contain step definitions from both fixture files
    And the library should contain hook definitions

  Scenario: Full reload produces a valid library
    Given a process that loads the reload fixtures through the API
    And it has loaded the support code
    When it calls reloadSupport with no changed paths
    Then the library should contain step definitions from both fixture files
    And the library should contain hook definitions

  Scenario: Full reload evicts and re-evaluates modules
    Given a process that loads the reload fixtures through the API
    And it has loaded the support code
    When it calls reloadSupport with no changed paths
    Then the fixture module should have been re-evaluated

  Scenario: Reload with a changed path keeps every support file's definitions
    Given a process that loads the reload fixtures through the API
    And it has loaded the support code
    When it calls reloadSupport with the first fixture as a changed path
    Then the fixture module should have been re-evaluated
    And the library should contain step definitions from both fixture files
