@injection @node
Feature: Test Features with injection support.

	Scenario: change can be seen among the shared workspace
		Given The Workspace is available and valid
		When I change the workspace in one step definition class
		Then I can see changed state in another step definition class





