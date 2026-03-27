const hooks = require('require-extension-hooks');
import { compileVueSFC } from './vue-sfc-compiler';

require('ts-node-maintained').register({
	compilerOptions: {
		module: 'nodeNext',
		target: 'es2022',
		strict: true,
		allowJs: true,
		allowSyntheticDefaultImports: true,
		esModuleInterop: true,
		experimentalDecorators: false,
		resolveJsonModule: true,
		skipLibCheck: true,
		lib: ['es2022', 'esnext.decorators']
	},
	transpileOnly: true
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
