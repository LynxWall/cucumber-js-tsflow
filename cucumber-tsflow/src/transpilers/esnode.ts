require('ts-node-maintained').register({
	transpileOnly: true,
	transpiler: '@lynxwall/cucumber-tsflow/lib/transpilers/esbuild-transpiler'
});

require('tsconfig-paths').register();
