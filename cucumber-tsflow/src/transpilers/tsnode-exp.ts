require('ts-node').register({
	compilerOptions: {
		module: 'nodeNext',
		target: 'es2022',
		strict: true,
		allowJs: true,
		allowSyntheticDefaultImports: true,
		esModuleInterop: true,
		experimentalDecorators: true,
		resolveJsonModule: true,
		skipLibCheck: true,
		lib: ['es2022']
	},
	transpileOnly: true
});

require('tsconfig-paths').register();
