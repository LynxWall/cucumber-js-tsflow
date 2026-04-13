import { build, Plugin, BuildContext, context } from 'esbuild';
import { globSync } from 'glob';
import path from 'path';
import fs from 'fs';
import { compileVueSFC } from '../transpilers/vue-sfc-compiler';
import { createLogger } from '../utils/tsflow-logger';
import ansis from 'ansis';

const logger = createLogger('prebuilder');

export interface PrebuildOptions {
	cwd: string;
	outdir: string;
	watch?: boolean;
	onRebuild?: () => void;
	format?: 'cjs' | 'esm';
}

/**
 * Rewrite .vue import/require specifiers to .js in the given source text.
 * In bundle:false mode esbuild does not resolve or rewrite import paths, so
 * require("../components/Foo.vue") would remain in the compiled JS even though
 * the .vue file has been compiled to .js by vueSfcPlugin.
 */
function rewriteVueSpecifiers(source: string): string {
	if (!source.includes('.vue')) return source;

	return source
		.replace(/(from\s+['"])([^'"]+)\.vue(['"])/g, '$1$2.js$3')
		.replace(/(require\s*\(\s*['"])([^'"]+)\.vue(['"]\s*\))/g, '$1$2.js$3')
		.replace(/(import\s*\(\s*['"])([^'"]+)\.vue(['"]\s*\))/g, '$1$2.js$3');
}

/**
 * Esbuild plugin to compile .vue files using the existing vue-sfc-compiler
 */
const vueSfcPlugin = (format: 'cjs' | 'esm'): Plugin => ({
	name: 'vue-sfc',
	setup(pluginBuild) {
		pluginBuild.onLoad({ filter: /\.vue$/ }, async args => {
			try {
				const source = await fs.promises.readFile(args.path, 'utf8');
				const { code } = compileVueSFC(source, args.path, { format });
				return {
					contents: rewriteVueSpecifiers(code),
					// Tell esbuild this is JS now
					loader: 'js'
				};
			} catch (error: any) {
				return {
					errors: [{ text: error.message, location: { file: args.path, line: 1 } }]
				};
			}
		});
	}
});

/**
 * Esbuild plugin to rewrite .vue import specifiers to .js in .ts/.tsx files.
 */
const vueImportRewritePlugin: Plugin = {
	name: 'vue-import-rewrite',
	setup(pluginBuild) {
		pluginBuild.onLoad({ filter: /\.tsx?$/ }, async args => {
			const source = await fs.promises.readFile(args.path, 'utf8');

			if (!source.includes('.vue')) {
				return undefined; // let esbuild handle normally
			}

			return {
				contents: rewriteVueSpecifiers(source),
				loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts'
			};
		});
	}
};

let activeContext: BuildContext | null = null;

/**
 * AOT Prebuilder: Globs all user .ts / .vue files and compiles them via Esbuild
 * into a hidden output directory, preserving the directory structure.
 */
export async function runPrebuild(options: PrebuildOptions): Promise<void> {
	const start = performance.now();

	logger.checkpoint('Starting AOT Prebuild', { cwd: options.cwd, outdir: options.outdir });

	// Glob all .ts, .tsx, .vue files excluding node_modules and the output directory
	// Note: We use posix paths for globs as recommended by the glob package
	const pattern = '**/*.{ts,tsx,vue}';
	const ignore = ['node_modules/**', `${path.relative(options.cwd, options.outdir)}/**`, '**/*.d.ts'];

	const entryPoints = globSync(pattern, {
		cwd: options.cwd,
		ignore,
		absolute: true
	});

	logger.checkpoint(`Found ${entryPoints.length} files to prebuild`);

	if (entryPoints.length === 0) {
		logger.checkpoint('No files found to prebuild');
		return;
	}

	// Copy non-compilable assets (.json, .css, etc.) so relative imports resolve from the build output
	await copyAssets(options.cwd, options.outdir);

	const format = options.format || 'cjs';

	const buildOptions = {
		entryPoints,
		outdir: options.outdir,
		outbase: options.cwd, // Preserve directory structure relative to cwd
		bundle: false, // File-to-file mirroring
		format,
		sourcemap: true as const,
		platform: 'node' as const,
		target: 'node18',
		plugins: [vueSfcPlugin(format), vueImportRewritePlugin],
		logLevel: 'error' as const
	};

	try {
		if (options.watch) {
			activeContext = await context({
				...buildOptions,
				plugins: [
					...buildOptions.plugins,
					{
						name: 'on-rebuild',
						setup(pluginBuild: any) {
							let watchStart = performance.now();
							pluginBuild.onStart(() => {
								watchStart = performance.now();
							});
							pluginBuild.onEnd((result: any) => {
								if (result.errors.length > 0) {
									logger.error(`Watch build failed with ${result.errors.length} errors`);
									console.error(ansis.redBright(`[Watch] Prebuild failed with ${result.errors.length} errors`));
								} else {
									const duration = Math.round(performance.now() - watchStart);
									logger.checkpoint('Watch rebuild completed', { durationMs: duration });
									console.log(ansis.greenBright(`[Watch] Prebuild updated in ${duration}ms`));
									if (options.onRebuild) {
										options.onRebuild();
									}
								}
							});
						}
					}
				]
			} as any);

			await activeContext.watch();
			logger.checkpoint('Watch mode active');
		} else {
			await build(buildOptions);
			const duration = Math.round(performance.now() - start);
			logger.checkpoint('AOT Prebuild completed', { durationMs: duration });
			console.log(ansis.greenBright(`Prebuild completed in ${duration}ms (${entryPoints.length} files)`));
		}
	} catch (error) {
		logger.error('AOT Prebuild failed', error);
		throw error;
	}
}

/**
 * Copy non-compilable asset files (.json, .css, images, etc.) into the prebuild
 * output directory so that relative imports from compiled JS resolve correctly.
 */
async function copyAssets(cwd: string, outdir: string): Promise<void> {
	const assetPattern = '**/*.{json,css,scss,png,jpg,jpeg,gif,svg,woff,woff2,ttf,eot}';
	const outRelative = path.relative(cwd, outdir);
	const ignore = [
		'node_modules/**',
		`${outRelative}/**`,
		'package.json',
		'package-lock.json',
		'tsconfig*.json',
		'cucumber.json'
	];

	const assets = globSync(assetPattern, { cwd, ignore, absolute: true });

	for (const asset of assets) {
		const relativePath = path.relative(cwd, asset);
		const dest = path.join(outdir, relativePath);
		await fs.promises.mkdir(path.dirname(dest), { recursive: true });
		await fs.promises.copyFile(asset, dest);
	}

	if (assets.length > 0) {
		logger.checkpoint(`Copied ${assets.length} asset file(s) to prebuild output`);
	}
}

/**
 * Re-maps absolute paths pointing into the user's cwd to point into the prebuild outdir instead,
 * and changes the extension from .ts/.vue to .js.
 */
export function mapToPrebuildPaths(paths: string[], cwd: string, outdir: string): string[] {
	return paths.map(p => {
		if (!p.startsWith(cwd)) return p;

		const relativePath = path.relative(cwd, p);
		const targetPath = path.join(outdir, relativePath);

		// Change extension to .js (what esbuild outputs for ts/vue)
		return targetPath.replace(/\.(ts|tsx|vue)$/, '.js');
	});
}
