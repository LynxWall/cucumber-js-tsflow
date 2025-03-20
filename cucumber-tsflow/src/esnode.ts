require('ts-node').register({
	compilerOptions: {
		module: 'nodeNext',
		target: 'es2022',
		strict: true,
		resolveJsonModule: true,
		esModuleInterop: true,
		skipLibCheck: true,
		lib: ['es2022', 'esnext.decorators']
	},
	transpileOnly: true,
	transpiler: '@lynxwall/cucumber-tsflow/lib/transpilers/esbuild-transpiler'
});

require('tsconfig-paths').register();
