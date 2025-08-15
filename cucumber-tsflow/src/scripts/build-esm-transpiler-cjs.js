const esbuild = require('esbuild');

async function build() {
	try {
		await esbuild.build({
			entryPoints: ['./src/transpilers/esm/esbuild-transpiler.mjs'],
			outfile: './lib/transpilers/esm/esbuild-transpiler-cjs.js',
			format: 'cjs',
			platform: 'node',
			bundle: true,
			external: ['esbuild', 'path', 'node:*'],
			banner: {
				js: '/* Auto-generated CJS wrapper for ESM esbuild transpiler */'
			}
		});
	} catch (error) {
		console.error('❌ Build failed:', error);
		process.exit(1);
	}
}

build();
