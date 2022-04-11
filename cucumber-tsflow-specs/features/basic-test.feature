@basic
Feature: Basic Test Feature

	Scenario: Basic test scenario
		Given some step to be executed
		When the condition is right
		Then we can see the result correctly

	@addNumbers
	Scenario: Adding two numbers

		Step definitions that are tagged will only be used in scenarios
		or features that have the same tag [addNumbers].

		Given I enter 2 and 8
		When checking the results
		Then I receive the result 10


