import { binding, given } from '../../../lib/bindings.js';

/**
 * A binding class that is not a support file itself: steps-c.ts imports it. Its bindings register when it
 * evaluates, so a load after the first must evaluate it again or lose them.
 */
@binding()
export default class HelperBindings {
	@given('a step from the helper module')
	helper(): void {}
}
