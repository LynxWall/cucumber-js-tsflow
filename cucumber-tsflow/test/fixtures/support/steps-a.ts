import { before, binding, given } from '../../../lib/bindings.js';

/**
 * Decorated support file for the support-loading tests: two steps (one tag-scoped) and a hook. The package.json
 * beside it makes this directory a CommonJS scope, so the es-node transpiler loads these files through require().
 */
@binding()
export default class StepsA {
	@given('a step from file a')
	plain(): void {}

	@given('a tagged step', '@tagged')
	tagged(): void {}

	@before()
	hook(): void {}
}
