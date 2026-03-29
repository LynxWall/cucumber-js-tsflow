import { before, binding, given } from '@lynxwall/cucumber-tsflow';

/**
 * Fixture binding used exclusively by the reload-support tests.
 * Not auto-loaded by the test runner (lives in fixtures/, not step_definitions/).
 * loadSupport/reloadSupport require it explicitly to exercise the API.
 */
@binding()
export default class ReloadFixture {
	@before('@reload-fixture')
	beforeHook() {
		// no-op; exists so the library has a hook definition to verify
	}

	@given('a reload fixture step')
	fixtureStep() {
		// no-op; exists so the library has a step definition to verify
	}
}
