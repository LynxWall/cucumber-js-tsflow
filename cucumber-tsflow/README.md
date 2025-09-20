![CI](https://github.com/lynxwall/cucumber-js-tsflow/workflows/CI/badge.svg)

# cucumber-tsflow

Provides 'specflow' like bindings for Cucumber-JS 12.2.0 in TypeScript 5.9+.

Supports Vue3 files in cucumber tests.

## Fork description

This is a detached fork of <https://github.com/timjroberts/cucumber-js-tsflow>. It has had the <https://github.com/wudong/cucumber-js-tsflow/tree/before_after_all_hooks> branch merged into it, which adds support for beforeAll and afterAll hooks.

This fork has been drastically modified from the original and will eventually be moved to a new project. In addition, the SpecFlow project has reached [end of life](https://reqnroll.net/news/2025/01/specflow-end-of-life-has-been-announced/), and this project will be rebranded. Further details will be provided in future updates. However, the new project will support the same functionality as cucumber-tsflow while providing additional tools and extensions.

## Release Updates (7.3.0)

With this release, we've finally added support for ESM Modules. For details on the new transpilers/loaders please see: [cucumber-tsflow ESM implementation](https://github.com/LynxWall/cucumber-js-tsflow/blob/master/cucumber-tsflow/src/transpilers/esm/README.md).

Along with ESM support, additional updates include:

- Cucumber-JS updated to version 12.2.0
- Typescript updated to version 5.9.2
- ts-node replaced with ts-node-maintained. For more information, please see the section titled **Node 22+ and ts-node** in the [cucumber-tsflow ESM implementation](https://github.com/LynxWall/cucumber-js-tsflow/blob/master/cucumber-tsflow/src/transpilers/esm/README.md).
- Other package updates.

## Release Updates (7.2.0)

With this release, support for **Experimental Decorators** was added for backwards compatibility with any code under test that is using experimental decorators.

- Cucumber-JS updated to version 11.3.0
- New configuration parameter named **experimentalDecorators** that can be used to enable support for older experimental decorators.
- Issue with using the companion [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=lynxwall.cucumber-tsflow-vscode) has been resolved.

## Release Updates (7.1.0)

With this latest release, cucumber-tsflow has been refactored to support cucumber-js version 11.2.0 along with other updates that include:

- **Switch to package exports** with both cucumber-tsflow and most of cucumber-js Public types and functions exported. This allows developers to use cucumber-tsflow as a replacement for cucumber-js without requiring a peer installation. Most of the functionality is still executed in cucumber-js, cucumber-tsflow just extends cucumber-js to switch from support functions to support decorators with scoped context. This change is what allows you to use a SpecFlow type of structure for defining code that will execute BDD tests.
- **API support** that implements and extends the cucumber-js API.
- Support for Node 22 and Typescript 5.8.
  - Switched to **official Typescript Decorators** with metadata support implemented in [Typescript 5.2](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#decorator-metadata).
- Transpiler configuration updates to support node and Typescript changes.
  - Added a new section to this readme that describes [Transpilers and TypeScript](#transpilers-and-typescript) in more detail.

## Features

This fork of cucumber-tsflow provides the following features that extend the original version:

- Test runner using the cucumber-tsflow command.

  - Uses underlying cucumber api to run tests.
  - Returns **four** exit codes:
    - **0** - All scenarios passing.
    - **1** - Invalid configuration or Unhandled exception when executing tests.
    - **2** - Implemented scenarios are passing but there are pending, undefined or unknown scenario steps.
    - **3** - One or more scenario steps have failed.

- CommonJS transpilers using either esbuild or ts-node-maintained.

- [ESM loaders](https://github.com/LynxWall/cucumber-js-tsflow/blob/master/cucumber-tsflow/src/transpilers/esm/README.md) using either esbuild or ts-node-maintained.

- Support for both Official and Experimental Decorators in TypeScript.

- Vue3 transformer used to handle .vue files in tests.

  **NOTE**: Supports browserless unit testing of Vue SFC components by loading only the `<template>` and `<script>` blocks. Vue SFC `<style>` blocks are disabled by default. However, when testing Vue components from a compiled library, styles can be enabled with the `enableVueStyle` configuration setting.

- Timeout in step definitions and hooks.

- WrapperOptions in step definitions.

- BeforeStep and AfterStep Hooks.

- Boolean custom definition added to cucumber expressions.

- Support for Parallel execution of tests.

- A behave-json-formatter that fixes json so it can be used with Behave Pro.

- A junit-bamboo formatter that generates xml compatible with the Bamboo JUnit plugin.

- tsflow-snippet-syntax used to format snippet examples.

  - snippets use the [Cucumber Expressions](https://github.com/cucumber/cucumber-expressions#readme) Syntax for parameters.

- [Context Injection](#context-injection) updates with support to initialize the context before each scenario test run and dispose the context after a scenario has finished executing.

<div style="padding: 15px; border: 1px solid transparent; border-color: transparent; margin-bottom: 20px; border-radius: 4px; color: #8a6d3b; background-color: #fcf8e3; border-color: #faebcc;">
<strong><span style="color: #000">Note:</span></strong> With recent updates you must use the <strong><span style="color: #000">cucumber-tsflow</span></strong> command to execute tests. This command executes the same API calls that cucumber-js does and supports all of the options and features as cucumber-js along with new features listed above.
</div>

## Quick Start

cucumber-tsflow uses TypeScript Decorators to create bindings for TypeScript classes and methods that allow those classes and methods to be used in your Cucumber-JS support files. As such, cucumber-tsflow has a dependency on Cucumber-JS and extends Cucumber-JS functionality. However, you run your specifications using the cucumber-tsflow command line tool.

### Install @lynxwall/cucumber-tsflow

#### npm

```bash
npm install @lynxwall/cucumber-tsflow --save-dev
```

#### pnpm

```bash
pnpm add @lynxwall/cucumber-tsflow --save-dev
```

#### yarn

```bash
yarn add --dev @lynxwall/cucumber-tsflow
```

**Note**: Latest updates with context management requires use of cucumber-tsflow to execute tests. As a result, you do not need to install @cucumber/cucumber. All necessary cucumber packages are installed as dependencies of cucumber-tsflow. If you do have @cucumber/cucumber in dependencies please remove the reference to avoid conflicts.

### Create .feature files to describe your specifications

By default, Cucumber-JS looks for .feature files in a folder called 'features', so create that folder and then create a new file called 'my_feature.feature':

```gherkin
# features/my_feature.feature

Feature: Example Feature
   This is an example feature

   Scenario: Adding two numbers
	  Given I enter 2 and 8
	  When checking the results
	  Then I receive the result 10
```

### Create the Support Files to support the Feature

<div style="padding: 15px; border: 1px solid transparent; border-color: transparent; margin-bottom: 20px; border-radius: 4px; color: #8a6d3b; background-color: #fcf8e3; border-color: #faebcc;">
<strong><span style="color: #000">Note:</span></strong> Cucumber-JS refers to any files that are used to implement tests (step definitions) along with any fixtures or utilities used in your tests as <strong><span style="color: #000">Support Files</span></strong>. As a result, any time you see references to support files or support code it is referring to test code.
</div>

By default, Cucumber-JS looks for support files beneath the 'features' folder. You can override this on the cucumber-tsflow command line by specifying the '-r' option. However, let's work with the default and create our code in the default location. We need to write step definitions to support the three steps that we created above.

Create a new 'ArithmeticSteps.ts' file:

```javascript
// features/ArithmeticSteps.ts

import { binding, given, then } from "@lynxwall/cucumber-tsflow";

@binding()
export default class ArithmeticSteps {
    private computedResult = 0;

	@given('I enter {int} and {int}')
	iEnterintAndint(int: number, int2: number): any {
		this.computedResult = int + int2;
    }

	@when('checking the results')
	checkingTheResults(): any {
		expect(this.computedResult).to.be.greaterThan(0);
	}

	@then('I receive the result {int}')
	iReceiveTheResultint(int: number): any {
		if (int !== this.computedResult) {
			throw new Error('Arithmetic Error');
		}
    }
}
```

**Note**: how the cucumber-tsflow Decorators are being used to bind the methods in the class. During runtime, these Decorators simply call the Cucumber code on your behalf in order to register callbacks with Given(), When(), Then(), etc. The callbacks that are being registered with Cucumber are wrappers around your bound class.

### Compiling your TypeScript Support Code

All support code, which includes your step definition files along with any test fixtures, utilities and references to source code are transpiled on the fly using transpilers that are included with cucumber-tsflow. This eliminates the requirement to prebuild any test code along with associated management of those builds.

If not using one of the [transpilers](#transpiler-and-vue3-supported) listed below you'll need to implement your own transpiler using guidance found in Cucumber-JS documentation: [Transpiling](https://github.com/cucumber/cucumber-js/blob/v12.2.0/docs/transpiling.md)

## Transpilers and TypeScript

Cucumber-tsflow provides several [transpilers](#transpiler-and-vue3-supported) that can be used in your configuration. However, you are not required to use them. If a different configuration or transpiler is needed you can copy code from one of the provided transpilers.

This section focuses on the configuration used to transpile your test code, and any dependencies, into JavaScript that is executed within the Cucumber-JS test runner.

### CommonJS and ESM

As of version 7.3.0, cucumber-tsflow supports projects written in both CommonJS & ESM.

Read more about [cucumber-tsflow ESM implementations](./cucumber-tsflow/src/transpilers/esm/README.md).

### TypeScript Configuration

There are two different bundlers, or transpilers, used in cucumber-tsflow: **ts-node** and **esbuild**. This section covers the typescript configuration used for each bundler. Included with cucumber-ts are six variations of these transpilers used to support different types of projects. However, there are only two variations of typescript configurations used for each bundler, one that uses official decorators and one that uses experimental decorators.

#### ts-node

The following typescript configuration is used in the ts-node transpilers configured for official decorators:

```typescript
	compilerOptions: {
		module: 'nodeNext',
		target: 'es2022',
		strict: true,
		allowJs: true,
		allowSyntheticDefaultImports: true,
		esModuleInterop: true,
		experimentalDecorators: false,
		resolveJsonModule: true,
		skipLibCheck: true,
		lib: ['es2022', 'esnext.decorators']
	}
```

This next typescript configuration is used in the ts-node transpilers configured for official decorators:

```typescript
	compilerOptions: {
		module: 'nodeNext',
		target: 'es2022',
		strict: true,
		allowJs: true,
		allowSyntheticDefaultImports: true,
		esModuleInterop: true,
		experimentalDecorators: true,
		resolveJsonModule: true,
		skipLibCheck: true,
		lib: ['es2022']
	}
```

As you can see the only difference is the setting for experimentalDecorators and the lib imports.

When test runs are started, the settings from your local tsconfig.json are loaded first and then the settings from the transpiler will override the specific settings shown above. As a result, you should use these transpilers in projects that will support these settings.

For example, the settings from the cucumber-tsflow vue test project is shown below:

```json
	"compilerOptions": {
		"baseUrl": ".",
		"module": "nodeNext",
		"target": "es2022",
		"strict": true,
		"allowJs": true,
		"allowSyntheticDefaultImports": true,
		"esModuleInterop": true,
		"resolveJsonModule": true,
		"skipLibCheck": true,
		"lib": ["es2022", "esnext.decorators"],
		"typeRoots": ["../../node_modules/@types"]
	}
```

These settings are similar to the default transpiler settings, which will not cause an issue.

### esbuild Transpilers

<div style="padding: 15px; border: 1px solid transparent; border-color: transparent; margin-bottom: 20px; border-radius: 4px; color: #8a6d3b; background-color: #fcf8e3; border-color: #faebcc;">
<strong><span style="color: #000">Note:</span></strong> The esbuild transpilers do not use compilerOptions from tsconfig. Instead, all of the options are configured within the esbuild module that's included with cucumber-tsflow.
</div>

Cucumber-tsflow provides two esbuild transpilers: one with esbuild and support for Vue using the vue-sfc transpiler, and another that only uses the esbuild transpiler. Both cucumber-tsflow transpilers use the same esbuild transpiler, which uses the following Common set of options:

```typescript
const commonOptions: CommonOptions = {
	format: 'cjs',
	logLevel: 'info',
	target: [`es2022`],
	minify: false,
	sourcemap: 'external'
};
```

As you can see, this also uses the same target as the typescript configuration. In addition, minify is set to false, which makes it easy to debug and step into code when running tests.

In order to support both official and experimental decorators the esbuild transpiler will use different configurations based on the experimentalDecorators flag in the cucumber configuration.

#### Official Decorators

When using official decorators the following settings are added using the esbuild tsconfigRaw setting.

```typescript
commonOptions.tsconfigRaw = {
	compilerOptions: {
		importsNotUsedAsValues: 'remove',
		strict: true
	}
};
```

#### Experimental Decorators

When using experimental decorators the experimentalDecorators setting is added to the tsconfigRaw settings. As mentioned, esbuild does not use tsconfig settings from ts-node or from a tsconfig file. As a result, this is the only option available to turn on experimental decorators when using esbuild.

```typescript
commonOptions.tsconfigRaw = {
	compilerOptions: {
		experimentalDecorators: true,
		importsNotUsedAsValues: 'remove',
		strict: true
	}
};
```

As mentioned at the beginning of this section, there are several transpilers provided, which can be used with your test project. The [transpilers](#transpiler-and-vue3-supported) section below provides information on how to configure your project to use one of these transpilers.

## Cucumber-tsflow Test Runner

As mentioned previously, with recent updates cucumber-tsflow must be used to execute tests. The reason for this update was to replace before and after hooks previously used to manage context with a message handler. Executing tests with cucumber-tsflow uses the same API calls that cucumber-js does. The only differences are updates to support new configuration parameters along with updates to step definitions that set the correct location.

The following example demonstrates executing cucumber-tsflow from the command line to execute tests:

```bash
C:\GitHub\cucumber-js-tsflow\cucumber-tsflow-specs\node (dev-0525 -> origin)
λ npx cucumber-tsflow -p esnode
Loading configuration from "cucumber.json".
Running Cucumber-TsFlow in Serial mode.

beforeAll was called
......................@basic after hook is called.
.......@basic after hook is called.
.......@basic after hook is called.
.......................................@tags1 after hook is called.
......@tagging afterTag method is called
.afterAll was called


15 scenarios (15 passed)
44 steps (44 passed)
0m00.072s (executing steps: 0m00.013s)
```

To recap, cucumber-tsflow extends cucumber-js, which means that all options and features provided by cucumber-js are supported with cucumber-tsflow. In other words, when executing tests using cucumber-tsflow the underlying cucumber API is actually used to run the tests.

### Executing with script in package.json

You can also add a script to package.json to execute the tests as shown below:

```json
"scripts": {
	"test": "cucumber-tsflow -p esnode"
}
```

With this script in place you can execute the tests using npm, pnpm or yarn,

**npm**

```bash
npm run test
```

**pnpm**

```bash
pnpm test
```

**yarn**

```bash
yarn test
```

<div style="padding: 15px; border: 1px solid transparent; border-color: transparent; margin-bottom: 20px; border-radius: 4px; color: #8a6d3b; background-color: #fcf8e3; border-color: #faebcc;">
<strong><span style="color: #000">Note:</span></strong> When executing cucumber-tsflow using scripts in package.json you will not have access to the exit code. This is due to the way that scripts are handled by package managers. If the command exit code is anything greater than 0, these scripts will always return 1. In other words, the commands shown above will return 0 or 1 regardless of the exit code returned from cucumber-tsflow.
</div>

### Executing Tests with Continuous Integration (CI)

When executing tests as part of Continuous Integration (CI) operations you should use the following command to execute the tests from the folder that contains your cucumber and Typescript (tsconfig) configuration files that are associated with tests you want to execute.

```bash
npx cucumber-tsflow -p default
```

This will allow you to access the exit code that is returned from cucumber-tsflow.

**cmd shell**

```bash
echo %errorlevel%
```

**powershell**

```bash
echo $LastExitCode
```

**bash**

```bash
echo $?
```

## New Configuration options

As mentioned, when using cucumber-tsflow to execute tests all of the configuration options documented here are supported: <https://github.com/cucumber/cucumber-js/blob/v12.2.0/docs/configuration.md>

In addition to cucumber configuration options the following two options have been added:

| Name                     | Type      | Repeatable | CLI Option                  | Description                                                  | Default |
| ------------------------ | --------- | ---------- | --------------------------- | ------------------------------------------------------------ | ------- |
| `transpiler`             | `string`  | No         | `--transpiler`              | Name of the transpiler to use: es-vue, ts-vue, es-node, ts-node, es-vue-esm, es-node-esm, ts-vue-esm, ts-node-esm | none    |
| `debugFile`              | `string`  | No         | `--debug-file`              | Path to a file with steps for debugging                      |         |
| `enableVueStyle`         | `boolean` | No         | `--enable-vue-style`        | Enable Vue `<style>` block when compiling Vue SFC.           | false   |
| `experimentalDecorators` | `boolean` | No         | `--experimental-decorators` | Enable TypeScript Experimental Decorators.                   | false   |

### Transpiler and Vue3 supported

Using TypeScript with cucumber-js requires setting tsconfig.json parameters as described here: [cucumber-js Transpiling](https://github.com/cucumber/cucumber-js/blob/v12.2.0/docs/transpiling.md). In addition, there is no support for transpiling Vue files with cucumber-js.

As a result, cucumber-tsflow adds several configurations for transpiling TypeScript code using the recommended configuration. In addition, support has been added to transform .vue files during test execution allowing you to test Vue SFC components using cucumber.

By default, the `<style>` block in Vue SFC components will not be loaded when .vue files are transformed. However, that behavior can be overridden when testing compiled Vue components from a library using the `enableVueStyle` configuration setting.

Cucumber-TsFlow provides the following transpilers:

| Name            | Transpiler/ Loader   | Bundler | Description                                                  |
| --------------- | -------------------- | ------- | ------------------------------------------------------------ |
| **es‑vue**      | esvue                | esbuild | Uses esbuild to transpile TypeScript code and adds a hook for .vue files, which transforms Vue SFC components into common-JS. |
| **es‑node**     | esnode               | esbuild | Uses esbuild to transpile TypeScript code for node test execution. Output is common-JS. |
| **es‑vue‑esm**  | esvue‑loader         | esbuild | Uses esbuild to transpile TypeScript code and adds a hook for .vue files, which transforms Vue SFC components into ESM. |
| **es‑node‑esm** | esnode‑loader        | esbuild | Uses esbuild to transpile TypeScript code for node test execution. Output is ESM. |
| **ts‑vue**      | tsvue or tsvue‑exp   | ts‑node | Uses ts-node to transpile TypeScript code and adds a hook for .vue files, which transforms Vue SFC components into common-JS. |
| **ts‑node**     | tsnode or tsnode‑exp | ts‑node | Uses ts-node to transpile TypeScript code for node test execution. Output is common-JS. |
| **ts‑vue‑esm**  | vue‑loader           | ts-node | Uses ts-node to transpile TypeScript code and adds a hook for .vue files, which transforms Vue SFC components into ESM. |
| **ts‑node‑esm** | tsnode‑loader        | ts-node | Uses ts-node to transpile TypeScript code for node test execution. Output is ESM. |

In the table above:

- **Name** - The name that would be used in cucumber.json configuration.
- **Transpiler/Loader** - The actual transpiler or loader (esm), that is loaded based on configuration.
  - **NOTE**: When experimental decorators are enabled a transpiler with -exp appended to the name is loaded. For ESM builds loaders are used that use the configuration setting to determine support for experimental decorators.
- **Bundler** - Main bundler used. ts-node (ts-node-maintained) or esbuild.

**NOTE:** When using Vue transpilers **jsdom** is also loaded globally to support loading and testing Vue SFC components.

##### Using the transpiler configuration option

When configuring cucumber to execute tests you can specify which transpiler to use with the `transpiler` configuration option as shown below:

```json
{
	"default": {
		"transpiler": "es-vue"
	}
}
```

##### Alternate without using the transpiler option

You can also use the `requireModule` parameter to configure a transpiler. The following example shows how to configure cucumber to use the `esvue` transpiler with the `requireModule` option.

```json
{
	"default": {
		"requireModule": ["@lynxwall/cucumber-tsflow/esvue"]
	}
}
```

### Debug File support

The new `debugFile` configuration option allows you to specify a .ts file with step definitions that you want to debug. This will search for a matching feature and execute the tests in that feature. This option is helpful when debugging tests and you don't want to run all of the tests.

If using VSCode to edit your project the following launch configurations can be used:

##### Debug All

```json
{
	"name": "Debug All",
	"type": "node",
	"request": "launch",
	"program": "${workspaceRoot}/node_modules/@lynxwall/cucumber-tsflow/bin/cucumber-tsflow/vue",
	"stopOnEntry": true,
	"args": ["-p", "esvue"],
	"cwd": "${workspaceRoot}",
	"runtimeExecutable": null,
	"runtimeArgs": ["--nolazy"],
	"env": {
		"NODE_ENV": "development"
	},
	"console": "integratedTerminal",
	"sourceMaps": true
}
```

##### Debug Feature

```json
{
	"name": "Debug Feature",
	"type": "node",
	"request": "launch",
	"program": "${workspaceRoot}/node_modules/@lynxwall/cucumber-tsflow/bin/cucumber-tsflow/vue",
	"stopOnEntry": true,
	"args": ["--debug-file", "${file}", "-p", "esvue"],
	"cwd": "${workspaceRoot}",
	"runtimeExecutable": null,
	"runtimeArgs": ["--nolazy"],
	"env": {
		"NODE_ENV": "development"
	},
	"console": "integratedTerminal",
	"sourceMaps": true
}
```

**Note:** When using `Debug Feature` you'll need to have the step definition file open as the current file in VS Code. The current file path is passed into the debugger as the ${file} argument for --debug-file.

## Bindings

Bindings provide the automation that connects a specification step in a Gherkin feature file to some code that
executes for that step. When using Cucumber with TypeScript you can define this automation using a 'binding' class:

```typescript
import { binding } from "@lynxwall/cucumber-tsflow";

@binding()
export default class MySteps {
    ...
}
```

## Step Definitions

Step definitions can be bound to automation code in a 'binding' class by implementing a public function that is
bound with a 'given', 'when' or 'then' binding decorator:

```typescript
import { binding, given, when, then } from "@lynxwall/cucumber-tsflow";

@binding()
export default class MySteps {
    ...
    @given('I perform a search using the value {string}')
    public givenAValueBasedSearch(searchValue: string): void {
        ...
    }
    ...
}
```

The function follows the same requirements of functions you would normally supply to Cucumber which means that the
functions may be synchronous by returning nothing, use the callback, or return a `Promise<T>`. Additionally, the
function may also be `async` following the TypeScript async semantics.

### Boolean Custom Parameter

As mentioned, cucumber-tsflow uses Cucumber Expressions for snippet syntax, which provides different parameter types used in expressions. However, a boolean type is not provided by default.

As a result, a new custom parameter type has been added for boolean matches. For example, when a scenario step contains the words `true` or `false` they will be replaced with the `{boolean}` parameter expression and passed into the step function.

The following Scenario uses boolean values in the Given and Then statements:

```gherkin
Scenario: Boolean type supported
	Given I pass true into a step
	When checking the boolean value
	Then we can see that true was passed in
```

The associated step definition replaces `true` in this scenario with a `{boolean}` expression as shown below:

```typescript
@given('I pass {boolean} into a step')
iPassbooleanIntoAStep(boolean: boolean): any {
	this.boolValue = boolean;
}

@when('checking the boolean value')
checkingTheBooleanValue(): any {
	expect(this.boolValue).not.to.be.undefined;
}

@then('we can see that {boolean} was passed in')
weCanThatbooleanWasPassedIn(boolean: boolean): any {
	expect(this.boolValue).to.equal(boolean);
}
```

More information on Cucumber Expressions and Custom Parameter Types can be found here: <https://github.com/cucumber/cucumber-expressions#readme>

### Step Tags

Step definitions can be conditionally selected for execution based on the tags of the scenario by supplying tags when using the binding
decorators:

```typescript
@given('I perform a search using the value {string}')
public givenAValueBasedSearch(searchValue: string): void {
    ...
    // The default step definition
    ...
}

@given('I perform a search using the value {string}', "@tagName")
public givenAValueBasedSearch(searchValue: string): void {
    ...
    // The step definition that will execute if the feature or
    // scenario has the @tagName defined on it
    ...
}
```

**Note**: Tags added to steps work the same as "Tagged Hooks" documented here: <https://github.com/cucumber/cucumber-js/blob/v12.2.0/docs/support_files/hooks.md>

## Hooks

Hooks can be used to perform additional automation on specific events such as before or after scenario execution.
Hooks can be restricted to run for only features or scenarios with a specific tag:

```typescript
import { binding, beforeAll, before, beforeStep, afterStep, after, afterAll } from "@lynxwall/cucumber-tsflow";

@binding()
class MySteps {
    ...
    @beforeAll()
    public beforeAllTests(): void {
        ...
    }

    @before()
    public beforeAllScenarios(): void {
        ...
    }

    @before("@requireTempDir")
    public async beforeAllScenariosRequiringTempDirectory(): Promise<void> {
        let tempDirInfo = await this.createTemporaryDirectory();

        ...
    }

    @beforeStep('@addNumbers')
    public beforeStep() {
	    ...
    }

    @afterStep('@addNumbers')
    public afterStep() {
	    ...
    }

    @after()
    public afterAllScenarios(): void {
        ...
    }

    @after("@requireTmpDir")
    public afterAllScenarios(): void {
        ...
    }

    @afterAll()
    public afterAllTests(): void {
        ...
    }
}

export = MySteps;
```

### Timeout in step definition and hooks

In step definition and hooks, we can set timeout. For example, to set the timeout for a step to be 20000ms, we can do:

```typescript

@given('I perform a search using the value {string}', undefined, 20000)
public givenAValueBasedSearch(searchValue: string): void {
    ...
    // this step will time tou in 20000ms.
    ...
}

```

tsflow currently doesn't have a way to define a global default step timeout,

but it can be easily done through Cucumber-JS `setDefaultTimeout` function.

### Passing WrapperOptions

In step definition, we can pass additional wrapper options to cucumber js. For example:

```typescript

@given('I perform a search using the value {string}', undefined, undefined, {retry: 2})
public givenAValueBasedSearch(searchValue: string): void {
    ...
    // this step will be retried by cucumber js
    ...
}

```

### Using different report formatters and tsflow-snippet-syntax

Changing the formatter used for generating json along with changing the Snippet Syntax can be done through the Cucumber-JS configuration file.

If it doesn't already exist, create a file named cucumber.json at the root of your project. This is where we can configure different options for CucumberJS.

#### Using the behave json formatter

The following example shows how to configure the behave formatter in cucumber.json. The tsflow-snippet-syntax module is configured as the default snippet syntax and does not require configuration. However, you can override the snippet syntax as documented here: <https://github.com/cucumber/cucumber-js/blob/v12.2.0/docs/custom_snippet_syntaxes.md>

```typescript
{
	"default": {
		"format": [
			"behave:cucumber_report.json"
		]
	}
}
```

#### Using the bamboo junit formatter

The following example shows how to configure the bamboo junit formatter in cucumber.json. This differs from the standard cucumber junit formatter in that "pending" and "undefined" tests do not get classified as failures, instead they are classified as skips

```typescript
{
	"default": {
		"format": [
			"junitbamboo:cucumber_report.xml"
		]
	}
}
```

## Context Injection

Like 'specflow', cucumber-tsflow supports a simple dependency injection framework that will instantiate and inject class instances into 'binding' classes for each executing scenario.

### Sharing Data between Steps and Bindings

Each scenario in a feature will get a new instance of the _Context_ object when the steps associated with a scenario are executed. Hooks and steps used by the scenario will have access to the same instance of a "Scenario Context" during execution of the test steps. In addition, if steps of a scenario are implemented in separate bindings, those steps will still have access to the same instance of the _Context_ object created for the scenario.

**Recent Updates:**

- versions >= 6.5.2

  - Updated execution of the `initialize()` function to pass in argument that is an object with information about the Test Case (Scenario).
    - The object passed in will be in the form:
      `{ pickle, gherkinDocument, testCaseStartedId } : StartTestCaseInfo`
  - Updated execution of the `dispose()` function to pass in argument that is an object with information about the Test Case (Scenario).
    - The object passed in will be in the form:
      `{ pickle, gherkinDocument, result, willBeRetried, testCaseStartedId } : EndTestCaseInfo`

- versions >= 6.5.0
  - Context classes now support an `initialize()` function that can be defined synchronous or asynchronous. The `initialize()` function is called after the `BeforeAll` hook and before any other hooks or steps. This provides the ability to initialize a scenario context before any tests are executed with support for async operations.
  - Context classes have always supported a `dispose()` function for cleanup. However, with latest updates the `dispose()` function can be defined synchronously or asynchronously.
- versions >= 6.4.0
  - The current Cucumber World object is now available as a constructor parameter on all classes defined for Context Injection. For more information on the World object see: [Access to Cucumber.js World object](#access-to-cucumber.js-world-object).

### Using Context Injection

With Context Injection you first need to define one or more classes that will be injected into a binding instance. Next, you'll need to add the context types to the `@binding` decorator and implement a constructor that passes initialized instances of the context type into the binding instance.

**Defining a Context class:**

- Create a simple _Context_ class representing the shared data. The class can have no constructor or a default empty constructor. However, to access the Cucumber World object you should define a constructor as shown in the example below.

**Synchronous example:**

```typescript
import { World } from '@cucumber/cucumber';
import { EndTestCaseInfo, StartTestCaseInfo } from '@lynxwall/cucumber-tsflow';

export class ScenarioContext {
	public world: World;
	public someValue = '';
	private id: string = '';

	constructor(worldObj: World) {
		this.world = worldObj;
	}
	public initialize({ pickle, gherkinDocument }: StartTestCaseInfo): void {
		this.id = this.makeid(5);
		console.log(`Sync init: ${this.id}`);
		console.log(`Start Test Case: ${this.getFeatureAndScenario(gherkinDocument.uri!, pickle.name)}`);
	}
	public dispose({ pickle, gherkinDocument }: EndTestCaseInfo): void {
		console.log(`Sync dispose: ${this.id}`);
		console.log(`End Test Case: ${this.getFeatureAndScenario(gherkinDocument.uri!, pickle.name)}`);
	}
	private getFeatureAndScenario(path: string, scenario: string): string | undefined {
		...
        return `${fileName}: ${scenario.split(' ').join('-')}`;
	}
	private makeid(length: number) {
		...
		return result;
	}
}
```

**Asynchronous example:**

```typescript
import { World } from '@cucumber/cucumber';
import { EndTestCaseInfo, StartTestCaseInfo } from '@lynxwall/cucumber-tsflow';

export class ScenarioContext {
	public world: World;
	public someValue = '';
	private id: string = '';

	constructor(worldObj: World) {
		this.world = worldObj;
	}
	public async initialize({ pickle, gherkinDocument }: StartTestCaseInfo): Promise<void> {
		this.id = this.makeid(5);
		await this.logTest(`Async init: ${this.id}`);
		await this.logTest(`Start Test Case: ${this.getFeatureAndScenario(gherkinDocument.uri!, pickle.name)}`);
	}
	public async dispose({ pickle, gherkinDocument }: EndTestCaseInfo): Promise<void> {
		await this.logTest(`Async dispose: ${this.id}`);
		await this.logTest(`End Test Case: ${this.getFeatureAndScenario(gherkinDocument.uri!, pickle.name)}`);
	}
	async logTest(text: string): Promise<void> {
		await Promise.resolve(console.log(text));
	}
	private getFeatureAndScenario(path: string, scenario: string): string | undefined {
		...
        return `${fileName}: ${scenario.split(' ').join('-')}`;
	}
    private makeid(length: number) {
		...
		return result;
	}
}
```

**Initialize Binding in Step class:**

- Update the `@binding()` decorator to indicate the types of context objects that are required by the 'binding' class. You can include up to nine separate _Context_ objects.
- Define a constructor on the `@binding` class with steps that need access to the shared data that accepts one or more context objects as parameters based on initialization of the `@binding` decorator.

**Single Context class example:**

```typescript
import { binding, given, when } from '@lynxwall/cucumber-tsflow';
import { ScenarioContext } from '../fixtures/scenario-context';
import { expect } from 'chai';

@binding([ScenarioContext])
export default class InjectionTestSteps1 {
	constructor(private context: ScenarioContext) {}

	@given('The Workspace is available and valid')
	theWorkspaceIsAvailableAndValid() {
		expect(this.context).not.to.be.undefined;
		expect(this.context.world).not.to.be.undefined;
	}

	@when('I change the workspace in one step definition class')
	whenIChangeTheWorkspaceInOneStep() {
		this.context.someValue = 'value changed';
	}
}
```

**Multiple Context classes example:**

```typescript
import { binding, given, when } from '@lynxwall/cucumber-tsflow';
import { ScenarioContext } from '../fixtures/scenario-context';
import { SyncContext } from '../fixtures/sync-context';
import { expect } from 'chai';

@binding([ScenarioContext, SyncContext])
export default class InjectionTestSteps1 {
	constructor(
		private context: ScenarioContext,
		private syncContext: SyncContext
	) {}

	@given('The Workspace is available and valid')
	theWorkspaceIsAvailableAndValid() {
		expect(this.context).not.to.be.undefined;
		expect(this.context.world).not.to.be.undefined;

		expect(this.syncContext).not.to.be.undefined;
		expect(this.syncContext.world).not.to.be.undefined;
	}

	@when('I change the workspace in one step definition class')
	whenIChangeTheWorkspaceInOneStep() {
		this.context.someValue = 'value changed';
	}
}
```

### Access to Cucumber.js World object

The context object that you inject can also be configured to access the [World](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/world.md) object from Cucumber.js, which provides the following:

- `attach`: a method for adding [attachments](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/attachments.md) to hooks/steps
- `log`: a method for [logging](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/attachments.md#logging) information from hooks/steps
- `parameters`: an object of parameters passed in via configuration

Starting with version **6.4.0** the Cucumber World object is now passed into a _Context_ class as a constructor parameter as shown below:

```typescript
import { World } from '@cucumber/cucumber';

export class ScenarioContext {
	public world: World;
	public someValue = '';

	constructor(worldObj: World) {
		this.world = worldObj;
	}

	public dispose(): void {
		this.someValue = '';
	}
}
```

In the example shown above, the world object instance passed in to the constructor is saved to a variable in the `ScenarioContext` class. This class is automatically initialized and injected into the constructor of a binding class when tests are executed. As a result, the world object, with access to world context parameters, logging and attachments, is available to most hooks and all steps within a test.

**NOTE:** `BeforeAll` and `AfterAll` hooks do not have access to the scenario context.

_Context_ classes, as demonstrated by the `ScenarioContext` example above, also support a `dispose()` function that is called when the execution of a test scenario is complete.

With instance initialization, and dispose functionality, you have the ability to initialize common support operations and data needed for scenario test runs, and cleanup any resources when scenario test runs are complete.

### Access to the World object without using a constructor

**NOTE:** This approach of accessing the Cucumber World object is still supported. However, the ability to access the world object during _Context_ initialization provides much better control over when context data is initialized versus relying on execution of a hook. As a result, using a `@before` hook as shown below is not recommended.

With this approach, you would define a world property on simple _Context_ class that you're injecting:

```typescript
import { World } from '@cucumber/cucumber';

export class ScenarioContext {
	public world!: World;
	public someValue = '';
}
```

Next you'll need to initialize the world property in a `@before` hook so that it's available to all steps in a scenario. This is done by adding a new file to the steps folder that is dedicated to initializing the class (`ScenarioContext` in this example) in a `@before` hook.

For this example I've added a file named world-context.ts with the following content:

```typescript
import { binding, before } from '@lynxwall/cucumber-tsflow';
import { ScenarioContext } from '../fixtures/scenario-context';
import { World } from '@cucumber/cucumber';

@binding([ScenarioContext])
export default class WorldContext {
	_worldObj?: World;

	constructor(private context: ScenarioContext) {}

	@before()
	beforeScenario() {
		this.context.world = this._worldObj as World;
	}
}
```

As described in the section on Hooks, the **_beforeScenario_** function will be executed before each scenario. We're accessing a member property that was bound to the class instance during creation of each step class, and initializing the world property.

**NOTE:** Examples of this and other tests can be found in the GitHub repository.
