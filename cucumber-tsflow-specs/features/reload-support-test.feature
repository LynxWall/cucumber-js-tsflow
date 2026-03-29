@reload @node @node-exp
Feature: Reload Support

  Tests for the reloadSupport API that verifies require cache
  eviction and support code library reconstruction.

  Scenario: Load support produces a valid library
    Given support options pointing at the reload fixture
    When I call loadSupport with the options
    Then the library should contain step definitions
    And the library should contain hook definitions

  Scenario: Full reload produces a valid library
    Given support options pointing at the reload fixture
    And support code has been loaded
    When I call reloadSupport with no changed paths
    Then the library should contain step definitions
    And the library should contain hook definitions

  Scenario: Full reload evicts and re-evaluates modules
    Given support options pointing at the reload fixture
    And support code has been loaded
    And the fixture module is cached in require cache
    When I call reloadSupport with no changed paths
    Then the fixture module should have been re-evaluated

  Scenario: Selective reload with a changed path
    Given support options pointing at the reload fixture
    And support code has been loaded
    When I call reloadSupport with the fixture as a changed path
    Then the library should contain step definitions
