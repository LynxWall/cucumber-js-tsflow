@cli-run @parse-error @node
Feature: Feature files that do not parse

  The features are parsed before the support code loads and their messages
  are replayed to the formatters afterwards. A parse error is reported once
  the support code has loaded, nothing runs, and the run fails. The "broken"
  profile of this workspace globs a fixture directory no other profile does.

  Scenario: A parse error is reported and nothing runs
    When I run the "broken" profile
    Then the parse phase reported 1 parse error
    And the error output reports a parse error in "src/fixtures/broken/two-features.feature"
    And the message stream "../reports/parse-error.ndjson" holds only the meta, source and parseError envelopes
    And the run exited with code 2
