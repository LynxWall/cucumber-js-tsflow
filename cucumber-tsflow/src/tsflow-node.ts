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
