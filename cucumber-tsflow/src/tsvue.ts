const hooks = require('require-extension-hooks');
const jestVue = require('@vue/vue3-jest');
const { GlobalRegistrator } = require('@happy-dom/global-registrator');

require('ts-node').register({
	compilerOptions: {
		module: 'commonjs',
		moduleResolution: 'node',
		target: 'es6',
		declaration: true,
		strict: true,
		skipLibCheck: true,
		noUnusedLocals: true,
		noUnusedParameters: true,
		removeComments: false,
		experimentalDecorators: true,
		inlineSourceMap: true
	},
	transpileOnly: true
});

// Register happy-dom globally
GlobalRegistrator.register();

const config = {
	moduleFileExtensions: ['js', 'vue', 'ts'],
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
