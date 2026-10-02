// @ts-nocheck: the unresolvable import is the point of this fixture; the load-failure spec loads it through the CLI
import { binding, given } from '@lynxwall/cucumber-tsflow/bindings';
import { helper } from './does-not-exist';

@binding()
export default class MissingImport {
	@given('a step from a file whose import is missing')
	step(): void {
		helper();
	}
}
