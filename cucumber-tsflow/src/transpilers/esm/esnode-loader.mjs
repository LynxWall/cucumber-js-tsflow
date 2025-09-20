import { createEsbuildLoader } from './loader-utils.mjs';

// Create and export the loader with default options
const loader = createEsbuildLoader({
	loaderName: 'esnode-loader',
	handleVue: false
});

export const { resolve, load, getFormat, transformSource } = loader;
