require('ts-node/esm').register({
	transpileOnly: true,
	transpiler: '@lynxwall/cucumber-tsflow/lib/transpilers/esm/esmbuild-transpiler'
});

require('tsconfig-paths').register();
