import { binding, defineParameterType, given, setDefaultTimeout } from '../../../lib/bindings.js';

// Registers with CucumberJS directly, beyond the decorators: a parameter type and the default timeout.
defineParameterType({ name: 'shade', regexp: /red|green/, transformer: (text: string) => text });
setDefaultTimeout(5000);

@binding()
export default class StepsB {
	@given('I pick a {shade} cucumber')
	pick(shade: string): void {
		void shade;
	}
}
