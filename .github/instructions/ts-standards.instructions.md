---
applyTo: "**/*.ts,**/*.vue"
---

# TypeScript Standards

## Compiler Configuration

Base config (`@uis/tsconfig/base.json`) is the foundation for all packages:

- `"strict": true` — no exceptions
- `"module": "ESNext"`, `"moduleResolution": "bundler"`
- `"target": "ESNext"`
- `"verbatimModuleSyntax": true` — use `import type` for type-only imports
- `"experimentalDecorators": true` — required for `@lynxwall/cucumber-tsflow`
- `"isolatedModules": true`
- `"useDefineForClassFields": true`

Extend the correct shared config for the context:

| Context | Extends |
|---|---|
| Library / package | `@uis/tsconfig/base.json` |
| Vue component library | `@uis/tsconfig/vue.json` |
| BDD unit tests | `@uis/tsconfig/bdd.json` |
| E2E tests | `@uis/tsconfig/e2e.json` |
| unbuild packages | `@uis/tsconfig/unbuild.json` |

## Formatting

- **Tabs** for indentation — never spaces
- Semicolons **required** at end of statements
- **No trailing commas**
- Brace style: `1tbs` (same line, single-line blocks allowed)
- Operator linebreak: `after` the operator
- Max **1** consecutive blank line

## Imports

Use `import type` for all type-only imports (`verbatimModuleSyntax` requires it):

```ts
import type { ValidationError } from 'class-validator';
import { validate } from 'class-validator';
```

Import order (enforced by `perfectionist/sort-imports`):

1. `type` imports
2. Parent/sibling/index type imports
3. Built-in modules
4. External packages
5. Internal aliases
6. Relative imports (parent → sibling → index)

Groups are sorted ascending/natural alphabetically. Separate logical groups with a blank line.

## Naming Conventions

| Construct | Convention | Example |
|---|---|---|
| Composables | `camelCase` prefixed with `use` | `useValidations`, `useResponsive` |
| Vue components | `PascalCase` file, `kebab-case` option name | `InplaceText` / `'inplace-text'` |
| Interfaces / types | `PascalCase` | `IpText`, `ValidationBase` |
| Constants | `camelCase` | `errorMsg`, `textDisplay` |
| Enums | `PascalCase` members | — |

## Types

- Prefer `interface` for object shapes, `type` for unions/aliases
- Avoid `any`; use `unknown` or a proper generic instead
- Use generics over `any` for reusable utilities:

```ts
const deepCopy = <T>(source: T): T => { ... };
```

- Add explicit return types on exported/public functions
- Use `!` non-null assertion only when you are certain the value exists

## Composables

Return a plain object from composable functions:

```ts
const useExample = () => {
	const doSomething = () => { ... };
	return { doSomething };
};

export default useExample;
```

Export the composable as the default export. Re-export from the component folder's `index.ts`.

## Classes

- Use `abstract` base classes for shared logic (`ValidationBase`)
- Keep `class-validator` decorators on model classes that extend `ValidationBase`
- Mark class fields `public`/`private` explicitly
- Use `reactive()` from Vue only for state that drives template reactivity

## Vue Components (`.vue` files)

Block order: `<script>` → `<template>` → `<style>`

When a component needs both a name and setup:

```vue
<script lang="ts">
	export default { name: 'MyComponent' };
</script>

<script setup lang="ts">
	// props, emits, composables, computed, methods
</script>
```

**Props:** use `withDefaults(defineProps<{}>(), {})` with JSDoc on each prop:

```ts
const props = withDefaults(
	defineProps<{
		/** Description of the prop */
		model: MyModel;
		readOnly?: boolean;
	}>(),
	{ readOnly: false }
);
```

**Emits:** use typed generic syntax:

```ts
const emit = defineEmits<{
	<T extends Record<string, any>>(event: 'save', payload: T): void;
}>();
```

- Import `virtual:uno.css` at the top of the first `<script>` block in components that use UnoCSS classes
- Indent script content one level inside `<script>` blocks (enforced by `vue/script-indent`)

## ESLint Rules to Know

- `perfectionist/sort-imports` and `perfectionist/sort-exports` are **errors** — keep imports and exports sorted
- `style/no-tabs: off` — tabs are allowed (and required)
- `no-console` is warned — remove `console.log` before committing (use `// eslint-disable-next-line no-console` only when necessary)
- `antfu/top-level-function` is off — arrow functions at module level are fine
