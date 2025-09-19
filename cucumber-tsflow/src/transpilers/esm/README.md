# ESM Transpilers for cucumber-tsflow

This directory contains transpiler configurations that enable cucumber-tsflow to work with ECMAScript Module (ESM) projects.

## Overview

When your project uses ES modules (`"type": "module"` in package.json), you'll need to use one of the ESM transpilers provided by cucumber-tsflow. These transpilers are configured using the `transpiler` option in your cucumber configuration.

_Note:_ if you just need ts-node/esm as a loader, you don't need a custom transpiler and can [follow the Cucumber ESM transpilation docs](https://github.com/cucumber/cucumber-js/blob/main/docs/transpiling.md#esm).

## Available ESM Transpilers

### ts-vue-esm

TypeScript + Vue support for ESM projects using ts-node.

**When to use:** Testing Vue 3 Single File Components in an ESM TypeScript project.

**Features:**

- Compiles TypeScript and Vue SFCs on-the-fly
- Automatic JSDOM environment setup
- Supports scoped styles (when enabled)
- Handles asset imports (images, fonts, etc.)
- Full TypeScript decorator support

**Configuration:**

```json
{
	"vue-esm": {
		"transpiler": "ts-vue-esm",
		"paths": ["../features/**/*.feature"],
		"import": ["./src/step_definitions/**/*.ts"],
		"tags": "@vue"
	}
}
```

### es-vue-esm

Esbuild + Vue support for ESM projects.

**When to use:** Testing Vue 3 SFCs when you want faster compilation with esbuild.

**Configuration:**

```json
{
	"vue-esm": {
		"transpiler": "es-vue-esm",
		"paths": ["../features/**/*.feature"],
		"import": ["./src/step_definitions/**/*.ts"],
		"tags": "@vue"
	}
}
```

## ts-node-esm

TypeScript support for ESM projects using ts-node.

**When to use:** Testing pure Node.js code in an ESM TypeScript project (no DOM needed).

**Features:**

- TypeScript compilation via ts-node/esm
- Full decorator support
- Path mapping support
- No DOM environment (lighter weight for non-UI tests)

**Configuration:**

```json
{
	"node-esm": {
		"transpiler": "ts-node-esm",
		"paths": ["../features/**/*.feature"],
		"import": ["./src/step_definitions/**/*.ts"]
	}
}
```

## es-node-esm

Esbuild support for ESM projects.

**When to use:** Testing pure Node.js code when you want faster compilation.

**Features:**

- Same as ts-node-esm but uses esbuild
- Faster build times
- No DOM environment

**Configuration:**

```json
{
	"node-esm": {
		"transpiler": "es-node-esm",
		"paths": ["../features/**/*.feature"],
		"import": ["./src/step_definitions/**/*.ts"]
	}
}
```

#### Features:

- Same as ts-vue-esm but uses esbuild for compilation
- Faster build times
- Automatic JSDOM environment setup

## Transpiler Selection Guide

## No Transpiler Option

If you don't specify a transpiler, cucumber-tsflow won't configure any loaders or transpilers. This allows you to:

- Use your own custom loaders
- Configure transpilation manually
- Use cucumber-js native ESM support directly

**Note:** When no transpiler is specified, you're responsible for handling TypeScript compilation and any module resolution.

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
		"experimentalSpecifierResolution": "node",
		"files": true
	}
}
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

| Your Project Type                      | Recommended Transpiler | Why                                              |
| -------------------------------------- | ---------------------- | ------------------------------------------------ |
| ESM + TypeScript + Vue                 | `ts-vue-esm`           | Full TypeScript support with Vue SFC compilation |
| ESM + TypeScript + Vue (fast builds)   | `es-vue-esm`           | Faster compilation with esbuild                  |
| ESM + TypeScript (no Vue)              | `ts-node-esm`          | Standard TypeScript support without Vue overhead |
| ESM + TypeScript (no Vue, fast builds) | `es-node-esm`          | Faster compilation for pure Node.js tests        |

### "Cannot find module" errors

Ensure your tsconfig.json has the ts-node configuration section
Check that experimentalSpecifierResolution is set to "node"

### Vue components not found

Check that the vue-shim.d.ts file is in your typeRoots
Ensure ts-node.file is set to true in tsconfig.json

### Styles not loading

Set global.enableVueStyle = true or use the environment variable
Install required preprocessors (sass, less, etc.) if using them

### TypeScript decorators not working

Verify your tsconfig.json includes "esnext.decorators" in lib array
Check that you're not using experimentalDecorators: true (unless needed for legacy code)

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

| CommonJS  | ESM Equivalent |
| --------- | -------------- |
| `ts-vue`  | `ts-vue-esm`   |
| `es-vue`  | `es-vue-esm`   |
| `ts-node` | `ts-node-esm`  |
| `es-node` | `es-node-esm`  |
