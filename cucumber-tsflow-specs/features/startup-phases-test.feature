@cli-run @startup @node @node-esm
Feature: Startup phase lines and user output

  The startup phase lines are written while the run is being prepared and
  close before user code runs. In serial mode the launch phase covers
  assembling the test cases and ends before the first BeforeAll hook, so what
  a hook prints starts on its own line instead of being appended to the phase
  line. The "basic" profile of each workspace runs basic-test.feature with a
  BeforeAll hook that prints "beforeAll was called".

  Scenario: Output from a BeforeAll hook starts on its own line
    When I run the "basic" profile
    Then the BeforeAll hook output starts on its own line
    And the run reported 3 scenarios passed
    And the run exited with code 0
