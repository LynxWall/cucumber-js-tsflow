const hooks = require('require-extension-hooks');
const jestVue = require('@vue/vue3-jest');

require('ts-node').register({
	compilerOptions: {
		module: 'umd',
		moduleResolution: 'node',
		target: 'es2018',
		strict: true,
		experimentalDecorators: true,
		typeRoots: [
			'node_modules/@types',
			'node_modules/@cucumber/cucumber/lib/types',
			'node_modules/@lynxwall/cucumber-tsflow/lib/types'
		]
	},
	transpileOnly: true
});

require('tsconfig-paths').register();

// Register jsdom globally and set SVGElement on global
require('jsdom-global')();
(global as any).SVGElement = (global as any).window.SVGElement;

const config = {
	config: {
		cwd: process.cwd()
	}
};

hooks('vue').push(function (params: any) {
	try {
		const transformResult = jestVue.process(params.content, params.filename, config);
		return transformResult.code;
	} catch (err) {
		console.log(err);
	}
});
