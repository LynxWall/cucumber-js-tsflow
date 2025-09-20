import type { ValidationError } from 'class-validator';
import {
	AlphaNumeric,
	EmailTest,
	GTDateTest,
	PhoneTest,
	IsDefinedTest,
	TestDate,
	ZipCodeTest
} from '@fixtures/validations-test-data';
import { after, binding, given, then, when } from '@lynxwall/cucumber-tsflow';
import { expect } from 'chai';
import { validate } from 'class-validator';

@binding()
export default class CustomValidationsSteps {
	private model: any;
	private errors: any;

	@after('@validations')
	after(): void {
		this.model = null;
	}

	@given('A sample object with Required validator')
	aSampleObjectWithRequiredValidator(): any {
		this.model = new IsDefinedTest();
	}

	@given('The value is satisfied by {int}')
	theValueIsSatisfiedByint(int: number): any {
		this.model.value = int;
	}

	@given('The value is satisfied by {string}')
	theValueIsSatisfiedBystring(string: string): any {
		this.model.value = string;
	}

	@given('A sample object with isDate validator')
	aSampleObjectWithIsDateValidator(): any {
		this.model = new TestDate();
	}

	@given('The sample object with isDate the date of {string}')
	theSampleObjectWithIsDateTheDateOfstring(string: string): any {
		this.model.date = string;
	}

	@when('The sample object is validated')
	async theSampleObjectIsValidated(): Promise<any> {
		await validate(this.model).then((errors: ValidationError[]) => {
			this.errors = errors;
		});
	}

	@then('The sample object contains no errors')
	theSampleObjectContainsNoErrors(): any {
		expect(this.errors.length).to.be.equal(0);
	}

	@given('A sample object with IsGreaterDateThan validator')
	aSampleObjectWithIsGreaterDateThanValidator(): any {
		this.model = new GTDateTest();
	}

	@given('The sample object has two dates that should validate')
	theSampleObjectHasTwoDatesThatShouldValidate(): any {
		expect(this.model.dateFrom).not.to.be.undefined;
		expect(this.model.dateTill).not.to.be.undefined;
	}

	@then('The sample object contains errors')
	theSampleObjectContainsErrors(): any {
		expect(this.errors.length).to.be.greaterThan(0);
	}

	@given('A sample object with IsPhoneNumber validator')
	aSampleObjectWithJhuValidPhoneNumberValidator(): any {
		this.model = new PhoneTest();
	}

	@given('The sample object has a phone number of {string}')
	theSampleObjectHasAPhoneNumberOfstring(string: any): any {
		this.model.phoneNumber = string;
	}

	@given('A sample object with IsAlphaNumeric validator')
	aSampleObjectWithIsAlphaNumericValidator(): any {
		this.model = new AlphaNumeric();
	}

	@given('The sample object contains only {string} characters')
	theSampleObjectContainsOnlystringCharacters(string: any): any {
		this.model.string = string;
	}

	@given('A sample object with IsPostalCode validator')
	aSampleObjectWithJhuValidZipCodeValidator(): any {
		this.model = new ZipCodeTest();
	}

	@given('The sample object contains the zip code of {string}')
	theSampleObjectContainsTheZipCodeOfstring(string: any): any {
		this.model.zip = string;
	}

	@given('A sample object with IsEmail validator')
	aSampleObjectWithJhuValidZipEmailValidator(): any {
		this.model = new EmailTest();
	}

	@given('The sample object contains the email of {string}')
	theSampleObjectContainsTheEmailOfstring(string: any): any {
		this.model.email = string;
	}
}
