@cli-run @selective @node
Feature: Selective loading

  With selectiveLoad on, a run consults an index that earlier runs wrote and
  loads only the support files the selected scenarios need, plus every file
  that registers something other than step definitions. The "selective"
  profile of this workspace selects one feature and lists five support files:
  basic-test.ts holds its steps, tag-test.ts and world-context.ts register
  hooks so they always load, and the other two are not needed.

  Scenario: A second run loads only the support files the selected scenarios use
    Given the "selective" profile has run once to write its selective-load index
    When I run the "selective" profile
    Then the run loaded 3 of 5 support files and skipped 2
    And the run reported 3 scenarios passed
    And the run exited with code 0

  Scenario: --no-selective-load loads every support file although an index exists
    Given the "selective" profile has run once to write its selective-load index
    When I run the "selective" profile with "--no-selective-load"
    Then the run loaded all 5 support files
    And the run reported 3 scenarios passed
    And the run exited with code 0
