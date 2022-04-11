![CI](https://github.com/lynxwall/cucumber-js-tsflow/workflows/CI/badge.svg)

# cucumber-tsflow

Provides 'specflow' like bindings for CucumberJS 8.0.0+ in TypeScript 1.7+.

Supports Vue3 files in cucumber tests.

## Fork description
This is a detached fork of <https://github.com/timjroberts/cucumber-js-tsflow>. It has had the <https://github.com/wudong/cucumber-js-tsflow/tree/before_after_all_hooks> branch merged into it, which adds support for beforeAll and afterAll hooks.

In addition, the following features have been added:
- Test runner using cucumber-tsflow command line
  - Uses underlying cucumber api to run tests
- Typescript and esbuild transpiler support
- Vue3 transformer used to handle .vue files in tests
- Timeout in step definitions and hooks
- WrapperOptions in step definitions
- BeforeStep and AfterStep Hooks
- Boolean custom definition added to cucumber expressions
- A behave-json-formatter that fixes json so it can be used with Behave Pro
- tsflow-snippet-syntax used to format snippet examples
  - snippets use the [Cucumber Syntax](https://github.com/cucumber/cucumber-expressions#readme) for parameters

## Quick Start

cucumber-tsflow uses TypeScript Decorators to create SpecFlow like bindings for TypeScript classes and methods that allow those classes and methods to be used in your CucumberJS support files. As such, cucumber-tsflow has a dependency on CucumberJS and extends CucumberJS functionality. However, you can run your specifications using the cucumber-tsflow command line tool.

### Install @lynxwall/cucumber-tsflow

#### npm

```bash
npm install @lynxwall/cucumber-tsflow --save-dev
```

#### yarn

```bash
yarn add --dev @lynxwall/cucumber-tsflow
```

**Note**: If you want to use cucumber-js to execute tests you will also need to install @cucumber/cucumber. However, if using cucumber-tsflow to execute tests you would only need to install @lynxwall/cucumber-tsflow, which will install all necessary cucumber packages.

### Create .feature files to describe your specifications

By default, CucumberJS looks for .feature files in a folder called 'features', so create that folder and then create a new file called 'my_feature.feature':

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

By default, CucumberJS looks for support files beneath the 'features' folder. You can override this on the cucumber command line by specifying the '-r' option. However, let's work with the default and create our code in the default location. We need to write step definitions to support the three steps that we created above.

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

If not using one of the [transpilers](#transpiler-and-vue3-supported) listed below you'll need a `tsconfig.json` file to compile your code. You'll also need to ensure that the `"moduleResolution": "node"` compiler option is set in order to bring in the typings that are shipped with cucumber-tsflow.

Running the cucumber-tsflow command line should execute your features along with the support code that you've created in the class.

In this quick example test state is encapsulated directly in the class. As your test suite grows larger and step definitions get shared between multiple classes, you can begin using '[Context Injection](#context-injection)' to share state between running step definitions (see below).

## Cucumber-tsflow Test Runner

While the cucumber-js command line can be used to execute cucumber-tsflow tests, many of the new features will not be available. For instance, when using cucumber-js all reports will contain the wrong location information. In addition, new configuration parameters --transpiler and --debug-file are not available.

In order to provide correct location information (step-definition file and line number), along with support for new configuration parameters. You can run cucumber tests using the cucumber-tsflow command line. The following example demonstrates executing cucumber-tsflow from the command line to execute tests:

```bash
C:\GitHub\cucumber-js-tsflow (vue-plugin -> origin)
λ npx cucumber-tsflow
Loading configuration and step definitions...
.....@basic after hook is called.
......@basic after hook is called.
........@tags1 after hook is called.
.....@tagging afterTag method is called
.......<Suspense> is an experimental feature and its API will likely change.
..

7 scenarios (7 passed)
20 steps (20 passed)
0m00.075s (executing steps: 0m00.037s)
```

cucumber-tsflow extends cucumber-js, which means that all options and features provided by cucumber-js are supported with cucumber-tsflow. In other words, when executing tests using cucumber-tsflow the underlying cucumber api is actually used to run the tests.

### New Configuration options

As mentioned, when using cucumber-tsflow to execute tests all of the configuration options documented here are supported: <https://github.com/cucumber/cucumber-js/blob/v8.0.0/docs/configuration.md>

In addition to cucumber configuration options the following two options have been added:

| Name              | Type       | Repeatable | CLI Option                | Description                                                                                                       | Default |
|-------------------|------------|------------|---------------------------|-------------------------------------------------------------------------------------------------------------------|---------|
| `transpiler`      | `string`   | No         | `--transpiler`            | Name of the transpiler to use: esnode, esvue, tsnode or tsvue                                                     | esnode  |
| `debugFile`       | `string`   | No         | `--debug-file`            | Path to a file with steps for debugging                                                                           |    |

#### Transpiler and Vue3 supported

Using TypeScript with cucumberJs requires a couple of tsconfig.json parameters and the output needs to be commonJS as documented here: <https://github.com/cucumber/cucumber-js/blob/v8.0.0/docs/transpiling.md>

As a result, cucumber-tsflow adds several configurations for transpiling TypeScript code using the recommended configuration. In addition, support has been added to transform .vue files during test execution allowing you to test Vue SFC components using cucumber.

The following transpilers are provided:
- **esnode**: Uses esbuild to transpile TypeScript code for node test execution.
- **esvue**: Uses esbuild to transpile TypeScript code and adds a hook for .vue files, which transforms Vue SFC components into commonJS.
  - **jsdom** is also loaded globally to support loading and testing Vue SFC components.
- **tsnode**: Uses typescript to transpile TypeScript code for node test execution.
- **tsvue**: Uses typescript to transpile TypeScript code and adds a hook for .vue files, which transforms Vue SFC components into commonJS.
  - **jsdom** is also loaded globally to support loading and testing Vue SFC components.

##### Using cucumber-tsflow command line

When using cucumber-tsflow to execute tests you can specify which transpiler to use with the `transpiler` configuration option as shown below:

```json
{
	"default": {
		"transpiler": "esvue",
		"publishQuiet": true
	}
}

```

##### Using cucumber-js command line

If using cucumber-js to execute tests you can still use one of the new transpiler configurations with the `requireModule` configuration option as shown below:

```json
{
	"default": {
		"requireModule": ["@lynxwall/cucumber-tsflow/lib/esvue"],
		"publishQuiet": true
	}
}

```

#### Debug File support

The new `debugFile` configuration option allows you to specify a .ts file with step definitions that you want to debug. This will search for a matching feature and execute the tests in that feature. This option is helpful when debugging tests and you don't want to run all of the tests.

If using VSCode to edit your project the following launch configurations can be used:

##### Debug All

```json
{
	"name": "Debug All",
	"type": "pwa-node",
	"request": "launch",
	"program": "${workspaceRoot}/node_modules/@lynxwall/cucumber-tsflow/bin/cucumber-tsflow",
	"stopOnEntry": true,
	"args": ["-p", "default"],
	"cwd": "${workspaceRoot}",
	"runtimeExecutable": null,
	"runtimeArgs": ["--nolazy"],
	"env": {
		"NODE_ENV": "development"
	},
	"externalConsole": false,
	"console": "integratedTerminal",
	"sourceMaps": true,
	"outDir": null
}
```

##### Debug Feature

```json
{
	"name": "Debug Feature",
	"type": "pwa-node",
	"request": "launch",
	"program": "${workspaceRoot}/node_modules/@lynxwall/cucumber-tsflow/bin/cucumber-tsflow",
	"stopOnEntry": true,
	"args": ["--debug-file", "${file}", "-p", "default"],
	"cwd": "${workspaceRoot}",
	"runtimeExecutable": null,
	"runtimeArgs": ["--nolazy"],
	"env": {
		"NODE_ENV": "development"
	},
	"externalConsole": false,
	"console": "integratedTerminal",
	"sourceMaps": true,
	"outDir": null
}
```

## Bindings

Bindings provide the automation that connects a specification step in a Gherkin feature file to some code that
executes for that step. When using Cucumber with TypeScript you can define this automation using a 'binding' class:

```javascript
import { binding } from "@lynxwall/cucumber-tsflow";

@binding()
export default class MySteps {
    ...
}
```

## Step Definitions

Step definitions can be bound to automation code in a 'binding' class by implementing a public function that is
bound with a 'given', 'when' or 'then' binding decorator:

```javascript
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

Step definitions can be conditionally selected for execution based on the tags of the scenario by supplying tags when using the binding
decorators:

```javascript
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

**Note**: Tags added to steps work the same as "Tagged Hooks" documented here: <https://github.com/cucumber/cucumber-js/blob/v8.0.0/docs/support_files/hooks.md>

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
	beforeStep() {
		...
	}

	@afterStep('@addNumbers')
	afterStep() {
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

but it can be easily done through cucumber.js ```setDefaultTimeout``` function.

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

### Using behave-json-formatter and tsflow-snippet-syntax

Changing the formatter used for generating json along with changing the Snippet Syntax can be done through the cucumber.js configuration file.

If it doesn't already exist, create a file named cucumber.js at the root of your project. This is where we can configure different options for cucumber.js.


#### Using cucumber-tsflow command line

The following example shows how to configure the behave formatter when using the cucumber-tsflow command line.
**Note**: When using cucumber-tsflow the tsflow-snippet-syntax is configured by default.

```javascript
{
	"default": {
		"format": [
			"behave:cucumber_report.json"
		],
		"publishQuiet": true
	}
}
```

#### Using cucumber-js command line

The following example shows how to configure the formatter and snippet syntax when using the cucumber-js command line:

```javascript
{
	"default": {
		"format": [
			"node_modules/@lynxwall/cucumber-tsflow/lib/behave.js:cucumber_report.json"
		],
		"formatOptions": { "snippetSyntax": "node_modules/@lynxwall/cucumber-tsflow/lib/snippet.js" },
		"publishQuiet": true
	}
}
```

The `format` line tells cucumber to generate a report using the behave-json-formatter.

The `formatOptions` line tells cucumber to generate example snippets using the tsflow-snippet-syntax.

## Sharing Data between Bindings

### Context Injection

Like 'specflow', cucumber-tsflow supports a simple dependency injection framework that will instantitate and inject
class instances into 'binding' classes for each execuing scenario.

To use context injection:

- Create simple classes representing the shared data (they *must* have default constructors)
- Define a constructor on the 'binding' classes that will require the shared data that accepts the context objects
as parameters
- Update the `@binding()` decorator to indicate the types of context objects that are required by the 'binding'
class

```javascript
import { binding, before, after } from "@lynxwall/cucumber-tsflow";
import { Workspace } from "./Workspace";

@binding([Workspace])
export default class MySteps {
    constructor(protected workspace: Workspace)
    { }

    @before("requireTempDir")
    public async beforeAllScenariosRequiringTempDirectory(): Promise<void> {
        let tempDirInfo = await this.createTemporaryDirectory();

        this.workspace.updateFolder(tempDirInfo);
    }
}
```
