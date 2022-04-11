require('ts-node').register({
	compilerOptions: {
		module: 'commonjs',
		moduleResolution: 'node',
		target: 'es2021',
		strict: true,
		experimentalDecorators: true,
		allowSyntheticDefaultImports: true,
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
