import { initializeJsdom, createEsbuildLoader } from './loader-utils.mjs';

initializeJsdom();

// Create and export the loader with default options
const loader = createEsbuildLoader({
	loaderName: 'esnode-loader',
	handleVue: false
});

export const { resolve, load, getFormat, transformSource } = loader;
