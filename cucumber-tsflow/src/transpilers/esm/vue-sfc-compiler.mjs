import { parse, compileScript, compileTemplate, compileStyle } from 'vue/compiler-sfc';
import hash from 'hash-sum';
import { transformSync } from 'esbuild';
import { createLogger } from '../../utils/tsflow-logger.mjs';

const logger = createLogger('vue-sfc');

/**
 * Vue Single File Component compiler for ESM
 *
 * Compiles .vue files into JavaScript modules that can be imported in Node.js.
 * Uses @vue/compiler-sfc to handle template, script, and style blocks.
 *
 * Features:
 * - TypeScript support in <script> blocks via esbuild
 * - Template compilation with proper component resolution
 * - Optional style compilation (controlled by enableStyle option)
 * - Asset URL transformation (images become imports)
 * - Scoped CSS support
 *
 * Style handling:
 * - When enableStyle is false (default): styles are ignored
 * - When enableStyle is true: styles are compiled and injected into document
 * - Preprocessors (SCSS, Less, etc.) are skipped if not installed
 *
 * @param {string} source - Vue SFC source code
 * @param {string} filename - Path to the Vue file
 * @param {Object} options - Compilation options
 * @param {boolean} options.enableStyle - Whether to process <style> blocks
 * @returns {Object} { code: string } - Compiled JavaScript module
 */
export function compileVueSFC(source, filename, options = {}) {
	const { enableStyle = false } = options;

	logger.checkpoint('compileVueSFC started', {
		filename,
		sourceLength: source?.length,
		enableStyle
	});

	// Validate inputs
	if (!source) {
		logger.error('Invalid source', null, { filename, sourceType: typeof source });
		throw new Error(`Invalid source for ${filename}: source is ${typeof source}`);
	}

	if (!filename) {
		logger.error('Invalid filename', null, { filenameType: typeof filename });
		throw new Error('Filename is required for Vue SFC compilation');
	}

	// Parse the SFC
	let descriptor;
	let parseErrors;
	try {
		logger.checkpoint('Parsing SFC', { filename });
		const parsed = parse(source, {
			filename,
			sourceMap: true
		});
		descriptor = parsed.descriptor;
		parseErrors = parsed.errors;
		logger.checkpoint('SFC parsed', {
			hasScript: !!descriptor.script,
			hasScriptSetup: !!descriptor.scriptSetup,
			hasTemplate: !!descriptor.template,
			styleCount: descriptor.styles?.length,
			errorCount: parseErrors?.length
		});
	} catch (error) {
		logger.error('SFC parse failed', error, { filename });
		throw new Error(`Failed to parse Vue SFC ${filename}: ${error.message}`, { cause: error });
	}

	if (parseErrors?.length) {
		const errorMessages = parseErrors.map(e => e.message).join('\n');
		logger.error('SFC parse errors', null, { filename, errors: parseErrors });
		throw new Error(`Vue SFC parse errors in ${filename}:\n${errorMessages}`);
	}

	// Generate component ID
	let id;
	try {
		logger.checkpoint('Generating component ID', { filename });
		id = hash(filename);
		logger.checkpoint('Component ID generated', { id });
	} catch (error) {
		logger.error('Failed to generate component ID', error, { filename });
		throw new Error(`Failed to generate component ID for ${filename}: ${error.message}`, { cause: error });
	}

	const hasScoped = descriptor.styles.some(s => s.scoped);
	logger.checkpoint('Scoped styles check', { hasScoped });

	// Parse template AST if template exists
	let templateAst = null;
	if (descriptor.template) {
		try {
			logger.checkpoint('Parsing template AST', { filename });
			const { ast } = compileTemplate({
				source: descriptor.template.content,
				filename,
				id,
				compilerOptions: {
					mode: 'module',
					parseOnly: true
				}
			});
			templateAst = ast;
			logger.checkpoint('Template AST parsed');
		} catch (error) {
			logger.error('Template AST parsing failed', error, { filename });
			throw new Error(`Failed to parse template AST in ${filename}: ${error.message}`, { cause: error });
		}
	}

	// Compile script
	let scriptCode = '';
	let compiledScript = undefined;
	if (descriptor.script || descriptor.scriptSetup) {
		try {
			logger.checkpoint('Compiling script', {
				filename,
				hasScript: !!descriptor.script,
				hasScriptSetup: !!descriptor.scriptSetup,
				scriptLang: descriptor.script?.lang || descriptor.scriptSetup?.lang
			});

			compiledScript = compileScript(descriptor, {
				id,
				inlineTemplate: false,
				sourceMap: true,
				genDefaultAs: '_sfc_main',
				templateAst,
				resolveComponents: true
			});

			logger.checkpoint('Script compiled', {
				contentLength: compiledScript.content?.length,
				hasBindings: !!compiledScript.bindings
			});
		} catch (error) {
			logger.error('Script compilation failed', error, { filename });
			throw new Error(`Failed to compile script in ${filename}: ${error.message}`, { cause: error });
		}

		// Check if the script is TypeScript
		const isTS = descriptor.script?.lang === 'ts' || descriptor.scriptSetup?.lang === 'ts';
		logger.checkpoint('Script language check', { isTS });

		if (isTS) {
			try {
				logger.checkpoint('Transpiling TypeScript with esbuild', { filename });
				const result = transformSync(compiledScript.content, {
					loader: 'ts',
					format: 'esm',
					target: 'es2022',
					sourcemap: 'inline'
				});
				scriptCode = result.code;
				logger.checkpoint('TypeScript transpiled', { outputLength: scriptCode?.length });
			} catch (error) {
				logger.error('esbuild TypeScript transpilation failed', error, {
					filename,
					contentPreview: compiledScript.content?.substring(0, 200)
				});
				throw new Error(`Failed to transpile TypeScript in ${filename}: ${error.message}`, { cause: error });
			}
		} else {
			scriptCode = compiledScript.content;
		}
	}

	// Compile template if exists
	let templateCode = '';
	if (descriptor.template) {
		try {
			logger.checkpoint('Compiling template', {
				filename,
				templateLength: descriptor.template.content?.length,
				hasScoped,
				hasBindings: !!compiledScript?.bindings
			});

			const template = compileTemplate({
				source: descriptor.template.content,
				filename,
				id,
				scoped: hasScoped,
				compilerOptions: {
					mode: 'module',
					bindingMetadata: compiledScript ? compiledScript.bindings : undefined
				},
				transformAssetUrls: {
					includeAbsolute: true
				}
			});

			if (template.errors.length) {
				const errorMessages = template.errors.map(e => e.message).join('\n');
				logger.error('Template compilation errors', null, { filename, errors: template.errors });
				throw new Error(`Template compilation errors in ${filename}:\n${errorMessages}`);
			}

			templateCode = template.code;
			logger.checkpoint('Template compiled', { outputLength: templateCode?.length });
		} catch (error) {
			if (error.message.includes('Template compilation errors')) {
				throw error; // Re-throw our own error
			}
			logger.error('Template compilation failed', error, { filename });
			throw new Error(`Failed to compile template in ${filename}: ${error.message}`, { cause: error });
		}
	}

	// Compile styles if enabled
	let styleCode = '';
	if (enableStyle && descriptor.styles.length > 0) {
		logger.checkpoint('Compiling styles', {
			filename,
			styleCount: descriptor.styles.length,
			styleLangs: descriptor.styles.map(s => s.lang || 'css')
		});

		const styles = [];

		for (let i = 0; i < descriptor.styles.length; i++) {
			const style = descriptor.styles[i];
			try {
				logger.checkpoint(`Compiling style block ${i}`, {
					lang: style.lang || 'css',
					scoped: style.scoped,
					contentLength: style.content?.length
				});

				const compiled = compileStyle({
					source: style.content,
					filename,
					id,
					scoped: style.scoped,
					preprocessLang: style.lang
				});

				if (compiled.errors.length) {
					const hasPreprocessorError = compiled.errors.some(
						e =>
							e.message.includes('sass') ||
							e.message.includes('scss') ||
							e.message.includes('less') ||
							e.message.includes('stylus')
					);

					if (hasPreprocessorError) {
						logger.warn(`Skipping ${style.lang || 'css'} style - preprocessor not available`, {
							filename,
							styleIndex: i
						});
						continue;
					}

					logger.warn(`Style compilation warnings`, {
						filename,
						styleIndex: i,
						errors: compiled.errors
					});
				}

				styles.push(compiled.code);
				logger.checkpoint(`Style block ${i} compiled`, { outputLength: compiled.code?.length });
			} catch (error) {
				if (error.message.includes('Cannot find module')) {
					logger.warn(`Skipping ${style.lang || 'css'} style - missing module`, {
						filename,
						styleIndex: i,
						error: error.message
					});
					continue;
				}
				logger.error(`Style compilation failed for block ${i}`, error, { filename });
				throw new Error(`Failed to compile style in ${filename}: ${error.message}`, { cause: error });
			}
		}

		if (styles.length > 0) {
			logger.checkpoint('Creating style injection code', { styleCount: styles.length });
			styleCode = `
// Style injection
if (typeof document !== 'undefined') {
  (function() {
    const styles = ${JSON.stringify(styles)};
    const id = '${id}';

    // Check if styles already injected
    if (!document.querySelector(\`[data-vite-vue-id="\${id}"]\`)) {
      styles.forEach((css, index) => {
        const style = document.createElement('style');
        style.setAttribute('data-vite-vue-id', id);
        if (${hasScoped}) {
          style.setAttribute('data-v-' + id, '');
        }
        style.textContent = css;
        document.head.appendChild(style);
      });
    }
  })();
}
`;
		}
	}

	// Combine everything
	logger.checkpoint('Combining compiled output', {
		hasScriptCode: !!scriptCode,
		hasTemplateCode: !!templateCode,
		hasStyleCode: !!styleCode
	});

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

	logger.checkpoint('compileVueSFC completed', {
		filename,
		outputLength: finalCode?.length
	});

	return {
		code: finalCode
	};
}
