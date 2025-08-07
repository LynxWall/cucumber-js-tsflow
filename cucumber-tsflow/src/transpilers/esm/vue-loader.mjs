import { fileURLToPath } from 'url';
import { compileVueSFC } from './vue-sfc-compiler.mjs';
import path from 'path';

console.log('>>> vue-loader: initializing');

// Cache for the TypeScript loader
let tsLoader;

async function getTsLoader() {
  if (!tsLoader) {
    try {
      // Import ts-node's ESM loader
      const tsNodeEsm = await import('ts-node/esm');
      tsLoader = tsNodeEsm;
      console.log('>>> vue-loader: ts-node ESM loader loaded');
    } catch (error) {
      console.error('>>> vue-loader: Failed to load ts-node ESM loader:', error);
      throw error;
    }
  }
  return tsLoader;
}

export async function load(url, context, nextLoad) {
	  // Handle asset files that Vue compiler turns into imports
  const assetExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
  const ext = path.extname(url).toLowerCase();

  if (assetExtensions.includes(ext)) {
    console.log(`>>> vue-loader: handling asset import: ${url}`);

    // In CJS, the assets plugin would register these and potentially transform them
    // For ESM testing, we'll return the file path as a module
    // This matches what a bundler's asset plugin would do
    const filePath = fileURLToPath(url);

    // You could also implement asset transformation here if needed
    // For example, copying to a dist folder, generating hashes, etc.
    return {
      format: 'module',
      source: `export default ${JSON.stringify(filePath)};`,
      shortCircuit: true
    };
  }

  // Only process .vue files directly
  if (url.endsWith('.vue')) {
    console.log(`>>> vue-loader: processing Vue SFC ${url}`);

    try {
      const { source } = await nextLoad(url, { ...context, format: 'module' });
      const code = source.toString();
      const filename = fileURLToPath(url);

      const compiled = compileVueSFC(code, filename);

      return {
        format: 'module',
        source: compiled.code,
        shortCircuit: true
      };
    } catch (error) {
      console.error(`>>> vue-loader: Failed to compile Vue SFC ${url}:`, error);
      throw new Error(`Failed to compile Vue SFC ${url}: ${error.message}`);
    }
  }

  // For TypeScript files, delegate to ts-node
  if (url.endsWith('.ts') || url.endsWith('.tsx')) {
    console.log(`>>> vue-loader: delegating TypeScript file to ts-node: ${url}`);

    try {
      const tsNode = await getTsLoader();
      return tsNode.load(url, context, nextLoad);
    } catch (error) {
      console.error(`>>> vue-loader: ts-node failed for ${url}:`, error);
      throw error;
    }
  }

  // For everything else, use the default loader
  // This includes: .js, .mjs, .json, node: URLs, etc.
  return nextLoad(url, context);
}

// Optional: export resolve hook if needed
export async function resolve(specifier, context, nextResolve) {
  // Check if we need to handle Vue file resolution
  if (specifier.endsWith('.vue')) {
    console.log(`>>> vue-loader: resolving Vue file: ${specifier}`);
  }

  // For TypeScript files, we might need to use ts-node's resolver
  if (specifier.endsWith('.ts') || specifier.endsWith('.tsx')) {
    try {
      const tsNode = await getTsLoader();
      if (tsNode.resolve) {
        return tsNode.resolve(specifier, context, nextResolve);
      }
    } catch (error) {
      // Fall through to default resolver
    }
  }

  return nextResolve(specifier, context);
}
