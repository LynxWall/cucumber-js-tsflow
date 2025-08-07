import { parse, compileScript, compileTemplate } from 'vue/compiler-sfc';
import hash from 'hash-sum';
import { transformSync } from 'esbuild';

export function compileVueSFC(source, filename) {
  const { descriptor, errors } = parse(source, {
    filename,
    sourceMap: true
  });

  if (errors.length) {
    throw new Error(errors.map(e => e.message).join('\n'));
  }

  const id = hash(filename);

  // Compile script
  let scriptCode = '';
  if (descriptor.script || descriptor.scriptSetup) {
    const script = compileScript(descriptor, {
      id,
      inlineTemplate: false,
      sourceMap: true,
      genDefaultAs: '_sfc_main'
    });

    // Check if the script is TypeScript
    const isTS = descriptor.script?.lang === 'ts' || descriptor.scriptSetup?.lang === 'ts';

    if (isTS) {
      // Transpile TypeScript to JavaScript
      const result = transformSync(script.content, {
        loader: 'ts',
        format: 'esm',
        target: 'es2022',
        sourcemap: 'inline'
      });
      scriptCode = result.code;
    } else {
      scriptCode = script.content;
    }
  }

  // Compile template if exists
  let templateCode = '';
  if (descriptor.template) {
    // Match the CJS behavior for asset URLs
    const assetUrlOptions = {
      includeAbsolute: true
    };

    const template = compileTemplate({
      source: descriptor.template.content,
      filename,
      id,
      scoped: descriptor.styles.some(s => s.scoped),
      compilerOptions: {
        mode: 'module'
      },
			// Force asset URLs to become imports (matching CJS behavior)
      transformAssetUrls: assetUrlOptions
    });

    if (template.errors.length) {
      throw new Error(template.errors.map(e => e.message).join('\n'));
    }

    templateCode = template.code;
  }

  // Combine everything
  let finalCode = scriptCode;

  if (templateCode) {
    // Add the render function to the component
    finalCode += '\n' + templateCode;
    finalCode += '\n_sfc_main.render = render;';
  }

  // Ensure there's a default export
  if (!/export\s+default/.test(finalCode)) {
    finalCode += '\nexport default _sfc_main;';
  }

	console.log('>>> vue-sfc-compiler: Final code for', filename);
  console.log(finalCode);

  // For ESM, we need to export everything properly
  return {
    code: finalCode  };
}
