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
	transpileOnly: true
});

require('tsconfig-paths').register();
