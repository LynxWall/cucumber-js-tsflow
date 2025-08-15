import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Create ts-node service with our configuration
const tsNode = require('ts-node');

// Use an absolute path to the transpiler
const transpilerPath = '@lynxwall/cucumber-tsflow/lib/transpilers/esm/esbuild-transpiler-cjs';

const service = tsNode.create({
	esm: true,
	experimentalSpecifierResolution: 'node',
	files: true,
	transpileOnly: true,
	transpiler: transpilerPath,
	compilerOptions: {
		experimentalDecorators: global.experimentalDecorators || false,
		module: 'ESNext',
		target: 'ES2022'
	}
});

// Create ESM hooks from the service
const esmHooks = tsNode.createEsmHooks(service);

// Export the loader hooks
export const resolve = esmHooks.resolve;
export const load = esmHooks.load;
export const getFormat = esmHooks.getFormat;
export const transformSource = esmHooks.transformSource;
