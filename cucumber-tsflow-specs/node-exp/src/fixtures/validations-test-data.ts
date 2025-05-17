import { IsEmail, IsAlphanumeric, IsDate, IsDefined, IsPostalCode, IsPhoneNumber, Min, Max } from 'class-validator';
import { Validate } from 'class-validator';

export class TestDate {
	@Validate(IsDate)
	date = new Date('1995-12-17T03:24:00');
}

export class GTDateTest {
	@IsDate()
	dateFrom: Date = new Date(2022, 0);

	@IsDate()
	dateTill: Date = new Date(2022, 1);
}

export class AlphaNumeric {
	@IsAlphanumeric()
	string = 'abc123';
}

export class ZipCodeTest {
	@IsPostalCode('US')
	zip = '1A2345';

	country = 'United States';

	isUnitedStates() {
		return this.country === 'United States';
	}
}

export class IsDefinedTest {
	@IsDefined()
	value: unknown = undefined;
}

export class PhoneTest {
	@IsPhoneNumber('US')
	phoneNumber = '33ZA';

	isInternational = false;
}

export class EmailTest {
	@IsEmail()
	email = 'test@test';
}
