@vue @vue-exp
Feature: Vue tests


	Scenario: Mount and test Basic Vue component
		Given There is a valid Basic Vue Component
		When The Basic component is mounted
		Then The Basic component should be testable

	Scenario: Mount and test Async Vue component
		Given There is a valid Async Vue Component
		When The Async component is mounted
		Then The Async component should be testable



