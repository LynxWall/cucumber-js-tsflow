require('ts-node-maintained').register({
	compilerOptions: {
		module: 'nodeNext',
		target: 'es2022',
		strict: true,
		allowJs: true,
		allowSyntheticDefaultImports: true,
		esModuleInterop: true,
		experimentalDecorators: false,
		resolveJsonModule: true,
		skipLibCheck: true,
		lib: ['es2022', 'esnext.decorators']
	},
	transpileOnly: true
});

require('tsconfig-paths').register();
