import { binding, given, when, then } from '@lynxwall/cucumber-tsflow';
import { expect } from 'chai';
import { ScenarioContext } from '../fixtures/scenario-context.js';

@binding([ScenarioContext])
export default class BackgroundTest {
	private navigateToLogin = false;
	private submitUserName = false;
	private loggedIn = false;
	private searchForLenovo = false;
	private navigateForLenovo = false;
	private addLaptop = false;

	// Background
	@given('I navigate to the login page')
	iNavigateToTheLoginPage(): any {
		this.navigateToLogin = true;
	}
	@when('I submit username and password')
	iSubmitUsernameAndPassword(): any {
		expect(this.navigateToLogin).to.be.true;
		this.submitUserName = true;
	}
	@then('I should be logged in')
	iShouldBeLoggedIn(): any {
		expect(this.submitUserName).to.be.true;
		this.loggedIn = true;
	}

	// first scenario
	@given('User search for Lenovo Laptop')
	userSearchForLenovoLaptop(): any {
		// set by background
		expect(this.loggedIn).to.be.true;
		this.searchForLenovo = true;
	}
	@when('Add the first laptop that appears in the search result to the basket')
	addTheFirstLaptopThatAppearsInTheSearchResultToTheBasket(): any {
		expect(this.searchForLenovo).to.be.true;
		this.addLaptop = true;
	}

	// second scenario
	@given('User navigate for Lenovo Laptop')
	userNavigateForLenovoLaptop(): any {
		// set by background
		expect(this.loggedIn).to.be.true;
		this.navigateForLenovo = true;
	}
	@when('Add the laptop to the basket')
	addTheLaptopToTheBasket(): any {
		expect(this.navigateForLenovo).to.be.true;
		this.addLaptop = true;
	}

	// common step for both scenarios
	@then('User basket should display with added item')
	userBasketShouldDisplayWithAddedItem(): any {
		expect(this.addLaptop).to.be.true;
	}
}
