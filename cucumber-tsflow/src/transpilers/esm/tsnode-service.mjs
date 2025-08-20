import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const tsNode = require('ts-node');

// Cache for different ts-node configurations
const serviceCache = new Map();

export function createTsNodeService(options = {}) {
	const cacheKey = JSON.stringify(options);

	if (serviceCache.has(cacheKey)) {
		return serviceCache.get(cacheKey);
	}

	// Ensure ts-node respects tsconfig.json files
	process.env.TS_NODE_FILES = process.env.TS_NODE_FILES || 'true';

	const defaultOptions = {
		esm: true,
		experimentalSpecifierResolution: 'node',
		files: true,
		transpileOnly: true,
		compilerOptions: {
			experimentalDecorators: global.experimentalDecorators || false,
			module: 'ESNext',
			target: 'ES2022'
		}
	};

	const service = tsNode.create({ ...defaultOptions, ...options });
	serviceCache.set(cacheKey, service);

	return service;
}

export function createEsmHooks(transpiler) {
	const service = createTsNodeService({ transpiler });
	return tsNode.createEsmHooks(service);
}
