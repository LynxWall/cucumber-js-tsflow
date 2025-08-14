# ESM Transpiler for cucumber-tsflow

This directory contains ECMAScript Module (ESM) loaders that enable cucumber-tsflow to work with modern ESM-based Node.js projects.

## Overview

This loader provides ESM support for testing Vue 3 Single File Components with cucumber-tsflow, allowing you to:

- Test Vue 3 Single File Components (`.vue` files)
- Write tests using ES modules (`import`/`export`)
- Use TypeScript with proper decorator support
- Import files without extensions
- Handle asset imports (images, styles, etc.)

_Note:_ if you just need ts-node/esm as a loader, you don't need a custom transpiler and can [follow the Cucumber ESM transpilation docs](https://github.com/cucumber/cucumber-js/blob/main/docs/transpiling.md#esm).

## Available Loaders

### vue-loader.mjs

Enables importing and testing Vue Single File Components in ESM environments.

**Features:**

- Compiles `.vue` files on-the-fly
- Handles TypeScript in Vue components
- Supports scoped styles (when enabled)
- Transforms asset URLs to imports
- Integrates with tsconfig path mappings

**Usage:**

```json
// cucumber.json
{
	"vue-esm": {
		"transpiler": "tsvueesm",
		"require": ["src/setup-jsdom.ts"],
		"paths": ["../features/**/*.feature"],
		"import": ["./src/step_definitions/**/*.ts"],
		"format": [["behave", "../reports/esvue.json"], "html:../reports/esvue.html", "junitbamboo:../reports/esvue.xml"],
		"tags": "@vue",
		"parallel": 0
	}
}
```

_Note:_ The "transpiler": "tsvueesm" option tells cucumber-tsflow to use the Vue ESM transpiler. This is registered internally by cucumber-tsflow.

## Configuration

### TypeScript Configuration

Your tsconfig.json should include:

```json
{
	"compilerOptions": {
		"baseUrl": ".",
		"module": "esnext",
		"moduleResolution": "bundler",
		"target": "es2022",
		"strict": true,
		"allowJs": true,
		"allowSyntheticDefaultImports": true,
		"esModuleInterop": true,
		"resolveJsonModule": true,
		"skipLibCheck": true,
		"allowImportingTsExtensions": true,
		"noEmit": true,
		"lib": ["es2022", "esnext.decorators"],
		"typeRoots": ["../../node_modules/@types"]
	},
	"include": ["./src/**/*.ts", "./src/**/*.vue"],
	"ts-node": {
		"esm": true,
		"experimentalSpecifierResolution": "node", // This is the key!
		"files": true
	}
}
```

### DOM Setup

When testing Vue components, you'll need to set up a DOM environment. Create a setup file:

```typescript
// src/setup-jsdom.ts
import 'global-jsdom/register';

// Or if using jsdom directly:
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
	url: 'http://localhost',
	pretendToBeVisual: true,
	resources: 'usable'
});

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
```

### Vue Type Definitions

Create a type definition file for Vue components:

```typescript
// src/types/vue-shim.d.ts
declare module '*.vue' {
	import type { DefineComponent } from 'vue';
	const component: DefineComponent<{}, {}, any>;
	export default component;
}
```

### Style Processing:

```javascript
// Enable in test setup
global.enableVueStyle = true;

// Or via environment variable
CUCUMBER_ENABLE_VUE_STYLE=true npm test
```

## Key Differences from CommonJS Versions

1. Module System
   - CJS: Uses require() and module.exports
   - ESM: Uses import and export
2. Loader Mechanism
   - CJS: Registers transpilers via require.extensions
   - ESM: Uses Node.js loader hooks (resolve, load, etc.)
3. TypeScript Handling
   - CJS: Inline transpilation with configurable transpiler
   - ESM: Delegates to ts-node/esm for TypeScript compilation
4. Configuration
   - CJS: Uses require option in cucumber.json
   - ESM: Uses loader option in cucumber.json

## Import Resolution

The loaders support importing without file extensions:

```typescript
// These all work:
import Component from './Component'; // -> ./Component.vue
import Helper from './utils/helper'; // -> ./utils/helper.ts
import styles from './styles/main'; // -> ./styles/main.css
import data from './data'; // -> ./data/index.ts
```

#### Extension resolution order:

1. .vue
2. .ts, .tsx, .mts, .cts
3. .js, .jsx, .mjs, .cjs
4. json

## Asset Handling

Image and asset imports are transformed to return the file path:

```vue
Copy code
<template>
	<img :src="logo" alt="Logo" />
</template>

<script setup>
	import logo from './assets/logo.png'; // Returns: "/path/to/assets/logo.png"
</script>
```

**Supported asset extensions:**

- Images: .jpg, .jpeg, .png, .gif, .svg, .webp, .ico
- Fonts: .woff, .woff2, .ttf, .eot

## Style Preprocessing

When enableVueStyle is true:

- Plain CSS is compiled and injected
- Preprocessors (SCSS, Less, Stylus) require their respective packages
- Missing preprocessors are skipped with a warning (won't fail the build)

```vue
<style lang="scss" scoped>
	// This will be skipped if 'sass' package is not installed
	.component {
		&:hover {
			color: blue;
		}
	}
</style>
```

## Troubleshooting

### "Cannot find module" errors

Ensure your tsconfig.json has the ts-node configuration section
Check that experimentalSpecifierResolution is set to "node"

### Vue components not found

Check that the vue-shim.d.ts file is in your typeRoots
Ensure ts-node.file is set to true in tsconfig.json

### Styles not loading

Set global.enableVueStyle = true or use the environment variable
Install required preprocessors (sass, less, etc.) if using them

## Examples

View examples in the [cucumber-tsflow-specs/vue-esm](https://github.com/LynxWall/cucumber-js-tsflow/tree/master/cucumber-tsflow-specs/vue-esm) project.

## TypeScript with Path Mappings

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"]
    }
  }
}

// step_definitions/app-steps.ts
import { binding } from '@lynxwall/cucumber-tsflow';
import Button from '@components/Button';  // Resolves to src/components/Button.vue
import { helper } from '@/utils/helper';   // Resolves to src/utils/helper.ts
```

## Performance Considerations

- First run may be slower due to compilation; subsequent runs use ts-node's cache
- Consider using transpileOnly: true in ts-node config for faster test runs

## Migration from CommonJS

1. Update package.json to include "type": "module"
2. Change require to import in your test files
3. Update cucumber.json to use the desired transpiler
4. Add the ts-node configuration to your tsconfig.json
5. Ensure all relative imports use proper extensions or configure extension resolution
