const hooks = require('require-extension-hooks');
import VueTransformer from './transpilers/vue-sfc';

require('ts-node').register({
	compilerOptions: {
		module: 'commonjs',
		moduleResolution: 'node',
		target: 'es2020',
		strict: true,
		experimentalDecorators: true,
		allowSyntheticDefaultImports: true,
		resolveJsonModule: true,
		esModuleInterop: true,
		skipLibCheck: true,
		lib: ['es2020']
	},
	transpileOnly: true
});

require('tsconfig-paths').register();

// Register jsdom globally and set SVGElement on global
require('jsdom-global')();
(global as any).SVGElement = (global as any).window.SVGElement;

hooks('vue').push(function (params: any) {
	try {
		const transformer = new VueTransformer({
			exclude: ['(?:^|/)node_modules/', '(?:^|/)cucumber-tsflow/lib/']
		});
		const transformResult = transformer.transformCode(params.content, params.filename);

		return transformResult.code;
	} catch (err) {
		console.log(err);
	}
	return params.content;
});
