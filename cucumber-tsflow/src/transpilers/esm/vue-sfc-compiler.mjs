import { parse, compileScript, compileTemplate, compileStyle } from 'vue/compiler-sfc';
import hash from 'hash-sum';
import { transformSync } from 'esbuild';

export function compileVueSFC(source, filename, options = {}) {
	const { enableStyle = false } = options;

	const { descriptor, errors } = parse(source, {
		filename,
		sourceMap: true
	});

	if (errors.length) {
		throw new Error(errors.map(e => e.message).join('\n'));
	}

	const id = hash(filename);
	const hasScoped = descriptor.styles.some(s => s.scoped);

	// First, we need to check if template uses any components
	let templateAst = null;
	if (descriptor.template) {
		// Parse template to get AST - this helps compileScript understand component usage
		const { ast } = compileTemplate({
			source: descriptor.template.content,
			filename,
			id,
			compilerOptions: {
				mode: 'module',
				parseOnly: true // Just parse, don't compile yet
			}
		});
		templateAst = ast;
	}

	// Compile script
	let scriptCode = '';
	let compiledScript = undefined;
	if (descriptor.script || descriptor.scriptSetup) {
		compiledScript = compileScript(descriptor, {
			id,
			inlineTemplate: false,
			sourceMap: true,
			genDefaultAs: '_sfc_main',
			templateAst, // Pass template AST so it knows which components are used
			// This tells the compiler to resolve components from setup bindings
			resolveComponents: true
		});

		// Check if the script is TypeScript
		const isTS = descriptor.script?.lang === 'ts' || descriptor.scriptSetup?.lang === 'ts';

		if (isTS) {
			// Transpile TypeScript to JavaScript
			const result = transformSync(compiledScript.content, {
				loader: 'ts',
				format: 'esm',
				target: 'es2022',
				sourcemap: 'inline'
			});
			scriptCode = result.code;
		} else {
			scriptCode = compiledScript.content;
		}
	}

	// Compile template if exists
	let templateCode = '';
	if (descriptor.template) {
		const template = compileTemplate({
			source: descriptor.template.content,
			filename,
			id,
			scoped: hasScoped,
			compilerOptions: {
				mode: 'module',
				// Pass the bindings from script compilation to template
				bindingMetadata: compiledScript ? compiledScript.bindings : undefined
			},
			// Force asset URLs to become imports (matching CJS behavior)
			transformAssetUrls: {
				includeAbsolute: true
			}
		});

		if (template.errors.length) {
			throw new Error(template.errors.map(e => e.message).join('\n'));
		}

		templateCode = template.code;
	}

	// Compile styles if enabled
	let styleCode = '';
	if (enableStyle && descriptor.styles.length > 0) {
		const styles = [];

		for (const style of descriptor.styles) {
			try {
				const compiled = compileStyle({
					source: style.content,
					filename,
					id,
					scoped: style.scoped,
					preprocessLang: style.lang
				});

				if (compiled.errors.length) {
					// Check if it's a preprocessor error
					const hasPreprocessorError = compiled.errors.some(
						e =>
							e.message.includes('sass') ||
							e.message.includes('scss') ||
							e.message.includes('less') ||
							e.message.includes('stylus')
					);

					if (hasPreprocessorError) {
						console.warn(`Skipping ${style.lang || 'css'} style in ${filename} - preprocessor not available`);
						continue;
					}

					console.warn(`Style compilation errors in ${filename}:`, compiled.errors);
				}

				styles.push(compiled.code);
			} catch (error) {
				// Handle missing preprocessor errors
				if (error.message.includes('Cannot find module')) {
					console.warn(`Skipping ${style.lang || 'css'} style in ${filename} - ${error.message}`);
					continue;
				}
				throw error;
			}
		}

		if (styles.length > 0) {
			// Create a style injection function
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
	let finalCode = scriptCode;

	if (templateCode) {
		// Add the render function to the component
		finalCode += '\n' + templateCode;
		finalCode += '\n_sfc_main.render = render;';
	}

	// Add scoped id if needed
	if (hasScoped) {
		finalCode += `\n_sfc_main.__scopeId = 'data-v-${id}';`;
	}

	// Add style injection
	if (styleCode) {
		finalCode = styleCode + '\n' + finalCode;
	}

	// Ensure there's a default export
	if (!/export\s+default/.test(finalCode)) {
		finalCode += '\nexport default _sfc_main;';
	}

	// For ESM, we need to export everything properly
	return {
		code: finalCode
	};
}
