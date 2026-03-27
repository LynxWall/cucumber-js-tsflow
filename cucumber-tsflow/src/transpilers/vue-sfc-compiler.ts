import { parse, compileScript, compileTemplate, compileStyle } from 'vue/compiler-sfc';
import hash from 'hash-sum';
import { transformSync } from 'esbuild';
import { createLogger } from '../utils/tsflow-logger';

const logger = createLogger('vue-sfc');

export type VueSFCFormat = 'cjs' | 'esm';

export type VueSFCOptions = {
	/** Whether to compile and inject <style> blocks. Default: false */
	enableStyle?: boolean;
	/** Output module format. Default: 'cjs' */
	format?: VueSFCFormat;
};

/**
 * Compile a Vue Single File Component to JavaScript.
 *
 * For CJS format: assembles script + template + styles then runs a single
 * esbuild pass (format: 'cjs') over the complete output with TS stripping.
 *
 * For ESM format: transpiles only the script block (if TypeScript), then
 * assembles the result with the already-valid-JS template and style code.
 *
 * @param source - Raw .vue file content
 * @param filename - Absolute path to the .vue file
 * @param options - Compilation options
 */
export function compileVueSFC(source: string, filename: string, options: VueSFCOptions = {}): { code: string } {
	const { enableStyle = false, format = 'cjs' } = options;

	logger.checkpoint('compileVueSFC started', { filename, format, enableStyle });

	if (!source) throw new Error(`Invalid source for ${filename}: source is ${typeof source}`);
	if (!filename) throw new Error('Filename is required for Vue SFC compilation');

	// Parse the SFC
	const { descriptor, errors: parseErrors } = parse(source, { filename, sourceMap: true });

	if (parseErrors?.length) {
		const msg = parseErrors.map(e => e.message).join('\n');
		logger.error('SFC parse errors', undefined, { filename, errors: parseErrors });
		throw new Error(`Vue SFC parse errors in ${filename}:\n${msg}`);
	}

	// Generate a stable component ID from the filename
	const id = hash(filename);
	const hasScoped = descriptor.styles.some(s => s.scoped);

	logger.checkpoint('SFC parsed', {
		hasScript: !!descriptor.script,
		hasScriptSetup: !!descriptor.scriptSetup,
		hasTemplate: !!descriptor.template,
		styleCount: descriptor.styles?.length,
		hasScoped
	});

	const isTS = descriptor.script?.lang === 'ts' || descriptor.scriptSetup?.lang === 'ts';

	// Read experimentalDecorators from global (set by load-configuration before transpilers run)
	const experimentalDecorators = !!(global as any).experimentalDecorators;
	const tsconfigRaw = {
		compilerOptions: {
			experimentalDecorators,
			...(experimentalDecorators ? { importsNotUsedAsValues: 'remove' as const } : {}),
			strict: true
		}
	};

	// ------------------------------------------------------------------
	// Script block
	// ------------------------------------------------------------------

	// Pre-parse template AST so compileScript can resolve bindings accurately
	let templateAst = null;
	if (descriptor.template) {
		try {
			const { ast } = compileTemplate({
				source: descriptor.template.content,
				filename,
				id,
				compilerOptions: { mode: 'module', parseOnly: true } as any
			});
			templateAst = ast;
		} catch (e: any) {
			throw new Error(`Failed to pre-parse template AST in ${filename}: ${e.message}`, { cause: e });
		}
	}

	let rawScriptContent = '';
	let compiledScript: ReturnType<typeof compileScript> | undefined;

	if (descriptor.script || descriptor.scriptSetup) {
		try {
			compiledScript = compileScript(descriptor, {
				id,
				inlineTemplate: false,
				sourceMap: true,
				genDefaultAs: '_sfc_main',
				templateAst: templateAst,
				resolveComponents: true,
				// Disable asset URL transforms: unit tests don't need asset imports
				templateOptions: { transformAssetUrls: false }
			} as any);
			rawScriptContent = compiledScript.content;
			logger.checkpoint('Script compiled', { contentLength: rawScriptContent.length });
		} catch (e: any) {
			throw new Error(`Failed to compile script in ${filename}: ${e.message}`, { cause: e });
		}
	}

	// For ESM: transpile the script block now (TS → ESM JS).
	// For CJS: keep raw content; the full assembly is transpiled below.
	let scriptCode = rawScriptContent;
	if (format === 'esm' && isTS && rawScriptContent) {
		try {
			const result = transformSync(rawScriptContent, {
				loader: 'ts',
				format: 'esm',
				target: 'es2022',
				sourcemap: 'inline',
				tsconfigRaw
			});
			scriptCode = result.code;
			logger.checkpoint('Script transpiled (ESM)', { outputLength: scriptCode.length });
		} catch (e: any) {
			throw new Error(`Failed to transpile TypeScript in ${filename}: ${e.message}`, { cause: e });
		}
	}

	// ------------------------------------------------------------------
	// Template block
	// ------------------------------------------------------------------

	let templateCode = '';
	if (descriptor.template) {
		try {
			const template = compileTemplate({
				source: descriptor.template.content,
				filename,
				id,
				scoped: hasScoped,
				compilerOptions: {
					mode: 'module',
					bindingMetadata: compiledScript?.bindings
				},
				// Disable asset URL transforms: unit tests don't need asset imports;
				// CJS has no stub loader for binary assets (e.g. *.jpg → require())
				transformAssetUrls: false
			});

			if (template.errors.length) {
				const msg = template.errors.map(e => (typeof e === 'string' ? e : e.message)).join('\n');
				throw new Error(`Template compilation errors in ${filename}:\n${msg}`);
			}

			templateCode = template.code;
			logger.checkpoint('Template compiled', { outputLength: templateCode.length });
		} catch (e: any) {
			throw new Error(`Failed to compile template in ${filename}: ${e.message}`, { cause: e });
		}
	}

	// ------------------------------------------------------------------
	// Style blocks (optional)
	// ------------------------------------------------------------------

	let styleCode = '';
	if (enableStyle && descriptor.styles.length > 0) {
		const styles: string[] = [];

		for (const style of descriptor.styles) {
			try {
				const compiled = compileStyle({
					source: style.content,
					filename,
					id,
					scoped: !!style.scoped,
					preprocessLang: style.lang as any
				});

				const hasPreprocessorError =
					compiled.errors.length > 0 &&
					compiled.errors.some(
						e =>
							e.message.includes('sass') ||
							e.message.includes('scss') ||
							e.message.includes('less') ||
							e.message.includes('stylus')
					);

				if (!hasPreprocessorError && compiled.code) {
					styles.push(compiled.code);
				} else if (hasPreprocessorError) {
					logger.warn(`Skipping ${style.lang ?? 'css'} style — preprocessor not available`, { filename });
				}
			} catch (e: any) {
				if (e.message.includes('Cannot find module')) {
					logger.warn(`Skipping style block — missing module`, { filename, error: e.message });
					continue;
				}
				throw new Error(`Failed to compile style in ${filename}: ${e.message}`, { cause: e });
			}
		}

		if (styles.length > 0) {
			styleCode = `
// Style injection
if (typeof document !== 'undefined') {
  (function() {
    const styles = ${JSON.stringify(styles)};
    const id = '${id}';
    if (!document.querySelector(\`[data-vite-vue-id="\${id}"]\`)) {
      styles.forEach((css) => {
        const style = document.createElement('style');
        style.setAttribute('data-vite-vue-id', id);
        if (${hasScoped}) { style.setAttribute('data-v-' + id, ''); }
        style.textContent = css;
        document.head.appendChild(style);
      });
    }
  })();
}
`;
		}
	}

	// ------------------------------------------------------------------
	// Assemble
	// ------------------------------------------------------------------

	let finalCode = scriptCode;

	if (templateCode) {
		finalCode += '\n' + templateCode;
		finalCode += '\n_sfc_main.render = render;';
	}

	if (hasScoped) {
		finalCode += `\n_sfc_main.__scopeId = 'data-v-${id}';`;
	}

	if (styleCode) {
		finalCode = styleCode + '\n' + finalCode;
	}

	if (!/export\s+default/.test(finalCode)) {
		finalCode += '\nexport default _sfc_main;';
	}

	// ------------------------------------------------------------------
	// CJS: transpile the assembled output in one pass (TS → CJS)
	// ------------------------------------------------------------------

	if (format === 'cjs') {
		try {
			const result = transformSync(finalCode, {
				loader: isTS ? 'ts' : 'js',
				format: 'cjs',
				target: 'es2022',
				tsconfigRaw
			});
			finalCode = result.code;
			logger.checkpoint('CJS transpilation complete', { outputLength: finalCode.length });
		} catch (e: any) {
			throw new Error(`Failed to transpile Vue SFC to CJS in ${filename}: ${e.message}`, { cause: e });
		}
	}

	logger.checkpoint('compileVueSFC complete', { filename, outputLength: finalCode.length });

	return { code: finalCode };
}
