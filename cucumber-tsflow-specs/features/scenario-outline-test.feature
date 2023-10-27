@node
Feature: Scenario Outlines

	Scenario Outline: A student can choose a module
		Given A student has selected the "<module>" module
		Then The "<module>" module is available
		Examples:
			| module           |
			| Course Schedule  |
			| My Academic Team |
			| My Billing       |

	Scenario Outline: Pressing buttons
		Given I push the "<BUTTON>" button
		Then I should see the <PAGEIDX> page
		Examples:
			| BUTTON | PAGEIDX |
			| RED    | 0       |
			| BLUE   | 1       |
			| YELLOW | 2       |
			| INFO   | 3       |
