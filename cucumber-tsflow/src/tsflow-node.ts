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
		lib: ['es2021'],
		typeRoots: [
			'node_modules/@types',
			'node_modules/@cucumber/cucumber/lib/types',
			'node_modules/@lynxwall/cucumber-tsflow/lib/types'
		]
	},
	transpileOnly: true
});

require('tsconfig-paths').register();
