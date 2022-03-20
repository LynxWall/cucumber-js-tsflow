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
		inlineSourceMap: true,
		resolveJsonModule: true,
		esModuleInterop: true
	},
	transpileOnly: true
});

require('tsconfig-paths').register();
