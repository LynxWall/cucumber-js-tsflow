import { createEsbuildLoader } from './loader-utils.mjs';

// Create and export the loader with Vue support
const loader = createEsbuildLoader({
	loaderName: 'esvue-loader',
	handleVue: true
});

export const { resolve, load, getFormat, transformSource } = loader;
