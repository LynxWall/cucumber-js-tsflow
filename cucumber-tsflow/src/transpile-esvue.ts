const hooks = require('require-extension-hooks');
import VueTransformer from './transpilers/vue-sfc';

require('ts-node').register({
	compilerOptions: {
		module: 'commonjs',
		moduleResolution: 'node',
		target: 'es2021',
		strict: true,
		experimentalDecorators: true,
		resolveJsonModule: true,
		esModuleInterop: true,
		skipLibCheck: true,
		lib: ['es2021']
	},
	ignore: ['(?:^|/)node_modules/', '(?:^|/)cucumber-tsflow/lib/'],
	transpileOnly: true,
	transpiler: '@lynxwall/cucumber-tsflow/lib/transpilers/esbuild-transpiler'
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
