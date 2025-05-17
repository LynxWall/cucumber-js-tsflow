@validations @node-exp @vue-exp
Feature: Validations

	Test functionality of Validations


	Scenario: Should test if the required validator works with strings
		Given A sample object with Required validator
		And The value is satisfied by "a string"
		When The sample object is validated
		Then The sample object contains no errors

	Scenario: Should test if the required validator works with numbers
		Given A sample object with Required validator
		And The value is satisfied by 100
		When The sample object is validated
		Then The sample object contains no errors

	Scenario: Should test isDate
		Given A sample object with isDate validator
		And The sample object with isDate the date of "09/09/1999"
		When The sample object is validated
		Then The sample object contains no errors

	Scenario: Should test two dates
		Given A sample object with IsGreaterDateThan validator
		And The sample object has two dates that should validate
		When The sample object is validated
		Then The sample object contains no errors

	Scenario: Should test for a valid phone number
		Given A sample object with IsPhoneNumber validator
		And The sample object has a phone number of <phone>
		When The sample object is validated
		Then The sample object contains no errors
		Examples:
			| phone          |
			| "14102122234"  |
			| "+18005551234" |

	Scenario: Should test for alpha numeric characters
		Given A sample object with IsAlphaNumeric validator
		And The sample object contains only <alphanumeric> characters
		When The sample object is validated
		Then The sample object contains no errors
		Examples:
			| alphanumeric |
			| "abc123"     |
			| "xyz123"     |

	Scenario: Should test for valid zip codes
		Given A sample object with IsPostalCode validator
		And The sample object contains the zip code of <zip>
		When The sample object is validated
		Then The sample object contains no errors
		Examples:
			| zip     |
			| "12345" |
			| "54321" |

	Scenario: Should test for valid emails
		Given A sample object with IsEmail validator
		And The sample object contains the email of <email>
		When The sample object is validated
		Then The sample object contains errors
		Examples:
			| email       |
			| "test@test" |
			| "xyz123"    |
