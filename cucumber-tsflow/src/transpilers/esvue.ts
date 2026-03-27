const hooks = require('require-extension-hooks');
import { compileVueSFC } from './vue-sfc-compiler';

require('ts-node-maintained').register({
	transpileOnly: true,
	transpiler: '@lynxwall/cucumber-tsflow/lib/transpilers/esbuild-transpiler'
});

require('tsconfig-paths').register();

// Register jsdom globally and set SVGElement on global
require('jsdom-global')();
(global as any).SVGElement = (global as any).window.SVGElement;

hooks('vue').push(function (params: any) {
	try {
		const result = compileVueSFC(params.content, params.filename, {
			enableStyle: !!(global as any).enableVueStyle,
			format: 'cjs'
		});
		return result.code;
	} catch (err) {
		console.error(err);
	}
	return params.content;
});
