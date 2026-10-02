import './helper-bindings';
import { binding, given } from '../../../lib/bindings.js';

/** Support file whose bindings partly come from a module outside the support globs. */
@binding()
export default class StepsC {
	@given('a step from file c')
	plain(): void {}
}
