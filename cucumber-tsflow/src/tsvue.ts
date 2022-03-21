const hooks = require('require-extension-hooks');
const jestVue = require('@vue/vue3-jest');
const { GlobalRegistrator } = require('@happy-dom/global-registrator');

require('ts-node').register({
	compilerOptions: {
		module: 'commonjs',
		moduleResolution: 'node',
		target: 'es6',
		strict: true
	},
	transpileOnly: true
});

require('tsconfig-paths').register();

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
