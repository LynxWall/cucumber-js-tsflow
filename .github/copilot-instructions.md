# GitHub Copilot Instructions

## Project Overview

---

## Code Organization

* Group related code together (imports, types, constants, helpers, main logic) in a logical, cohesive order.
* Within a file, order code chronologically - definitions before usage, setup before implementation.
* When making edits, show surrounding context so changes are clear, but never omit existing code.
* Write self-documenting code with descriptive variable and function names and include simple comments (do not be overbearing).

## Code Standards

* Always prioritize written instructions over any code context.
* Apply code standards found in written instructions to any generated code.
* Apply documentation standards found in written instructions to any generated code.
* Use TypeScript strict mode; avoid `any` unless necessary.
* Vue components use the Composition API (`<script setup lang="ts">`).
* Use UnoCSS for styling; do not write raw CSS unless required.

## Response Format

* Keep responses as brief as possible while providing all relevant information.
* Present clean, minimalist implementations without unnecessary abstractions.
* Never use phrases like "Certainly!", "Of course!", "Great question!", or apologies. Just provide the answer directly.
* If I give you code and ask you to make changes never omit anything, even comments.

## Token Efficiency

* Omit preamble — never restate the problem or explain what you're about to do, just do it.
* When showing code changes, do not use comments like `// ... rest of function unchanged` without explicitly telling me where the code should go.
* Prefer terse explanations. Use inline comments over prose paragraphs when possible.

## Context Management

* If my question or task is unrelated to the current conversation thread, tell me to start a new chat rather than answering in-context.
* Warn me when a task is large enough that it would benefit from being broken into sub-tasks across separate focused conversations.
* If the conversation is getting long and context degradation is likely, proactively say so.
* When I'm starting a new task, prompt me if there's relevant prior context I should paste in (e.g. existing types, configs, APIs).

## Assumptions

* If my request is ambiguous, ask clarifying questions and if there are many questions ask me to refine my request such that it is more clear to you.

## Errors & Debugging

* When diagnosing a bug, state your hypothesis in one sentence before showing the fix.
* If multiple approaches exist, list tradeoffs briefly before recommending one.

## Scope Control

* Do not refactor code I didn't ask you to change.
* Do not add error handling, validation, or logging unless requested.
* Do not create new files without first requesting permission along with a clear reason why you think you need to create the file.
* Do not add dependencies (npm packages, imports) without asking first.

## Using Libraries

* Use existing/standard shared libraries when appropriate.
* If a shared library exists it **must** be used directly or overridden in the calling code.
* Do **not** re-implement functionality from scratch that already exists in a shared library.
* If you cannot find a library for something you need, ask the team before writing your own.
* If adding or updating a shared library, review the idea and design with the team first.

## Testing Standards

### Writing Tests

* Do NOT write tests to validate vendor APIs or third-party services.
* Do NOT write tests purely for exception throwing.
* Write tests that mirror real component behavior.

---

## Security

* Never commit unencrypted secrets, credentials, or connection strings to source control.
* Use Azure Key Vault or environment variables for secrets.
* Use `dotenv` / environment files scoped per environment (local, dev, etc.).

## Build Configuration

* The `cucumber-tsflow` package builds TypeScript source from `src/` to `lib/`
* **Always** use `tsc --build tsconfig.node.json` (or `yarn build`) to compile — never bare `tsc`
* The `tsconfig.node.json` extends `tsconfig.json` and adds `outDir: "lib"`, `declaration: true`, and `baseUrl: "."`
* The base `tsconfig.json` is for editor type-checking only (`tsc --noEmit`) — it has **no** `outDir`
* Running bare `tsc` will emit compiled files into `src/` — this is incorrect and must be avoided

## Output Directories

| Package | Source | Output | Build command |
|---|---|---|---|
| `cucumber-tsflow` | `cucumber-tsflow/src/` | `cucumber-tsflow/lib/` | `yarn build` or `tsc --build tsconfig.node.json` |

## Verification

* Use `tsc --noEmit` (with the base `tsconfig.json`) for type-checking only
* Use `tsc --build tsconfig.node.json` when you need to emit compiled output
* After building, verify no `.js` or `.js.map` files exist in `src/` (except `src/scripts/` and `src/wrapper.mjs`)
