![CI](https://github.com/lynxwall/cucumber-js-tsflow/workflows/CI/badge.svg)

# cucumber-tsflow

Provides 'specflow' like bindings for CucumberJS 9.6.0+ in TypeScript 5.0+.

Supports Vue3 files in cucumber tests.

## Fork description

This is a detached fork of <https://github.com/timjroberts/cucumber-js-tsflow>. It has had the <https://github.com/wudong/cucumber-js-tsflow/tree/before_after_all_hooks> branch merged into it, which adds support for beforeAll and afterAll hooks.

In addition, the following features have been added:

- Test runner using the cucumber-tsflow command.
  - Uses underlying cucumber api to run tests.
  - Returns **four** exit codes:
    - **0** - All scenarios passing.
    - **1** - Invalid configuration or Unhandled exception when executing tests.
    - **2** - Implemented scenarios are passing but there are pending, undefined or unknown scenario steps.
    - **3** - One or more scenario steps have failed.
- Typescript and esbuild transpiler support.
- Vue3 transformer used to handle .vue files in tests.
- Timeout in step definitions and hooks.
- WrapperOptions in step definitions.
- BeforeStep and AfterStep Hooks.
- Boolean custom definition added to cucumber expressions.
- Support for Parallel execution of tests.
- A behave-json-formatter that fixes json so it can be used with Behave Pro.
- tsflow-snippet-syntax used to format snippet examples.
  - snippets use the [Cucumber Expressions](https://github.com/cucumber/cucumber-expressions#readme) Syntax for parameters.

<div style="padding: 15px; border: 1px solid transparent; border-color: transparent; margin-bottom: 20px; border-radius: 4px; color: #8a6d3b; background-color: #fcf8e3; border-color: #faebcc;">
<strong><span style="color: #000">Note:</span></strong> With recent updates you must use the <strong><span style="color: #000">cucumber-tsflow</span></strong> command to execute tests. This command executes the same API calls that cucumber-js does and supports all of the options and features as cucumber-js along with new features listed above.
</div>

## Quick Start

cucumber-tsflow uses TypeScript Decorators to create SpecFlow like bindings for TypeScript classes and methods that allow those classes and methods to be used in your CucumberJS support files. As such, cucumber-tsflow has a dependency on CucumberJS and extends CucumberJS functionality. However, you run your specifications using the cucumber-tsflow command line tool.

### Install @lynxwall/cucumber-tsflow

#### npm

```bash
npm install @lynxwall/cucumber-tsflow --save-dev
```

#### yarn

```bash
yarn add --dev @lynxwall/cucumber-tsflow
```

**Note**: Latest updates with context management requires use of cucumber-tsflow to execute tests. As a result, you do not need to install @cucumber/cucumber. All necessary cucumber packages are installed as dependencies of cucumber-tsflow. If you do have @cucumber/cucumber in dependencies please remove the reference to avoid conflicts.

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

By default, CucumberJS looks for support files beneath the 'features' folder. You can override this on the cucumber-tsflow command line by specifying the '-r' option. However, let's work with the default and create our code in the default location. We need to write step definitions to support the three steps that we created above.

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

Running the cucumber-tsflow command will execute your features along with the support code that you've created in the class.

In this quick example test state is encapsulated directly in the class. As your test suite grows larger and step definitions get shared between multiple classes, you can begin using '[Context Injection](#context-injection)' to share state between running step definitions.

## Cucumber-tsflow Test Runner

As mentioned previously, with recent updates cucumber-tsflow must be used to execute tests. The reason for this update was to replace before and after hooks previously used to manage context with a message handler. Executing tests with cucumber-tsflow uses the same API calls that cucumber-js does. The only differences are updates to support new configuration parameters along with updates to step definitions that set the correct location.

The following example demonstrates executing cucumber-tsflow from the command line to execute tests:

```bash
C:\GitHub\cucumber-js-tsflow (dev -> origin)
λ npx cucumber-tsflow
Loading configuration and step definitions...

beforeAll was called
......@basic after hook is called.
.......@basic after hook is called.
.......@basic after hook is called.
...........@tags1 after hook is called.
......@tagging afterTag method is called
.........<Suspense> is an experimental feature and its API will likely change.
..afterAll was called

8 scenarios (8 passed)
24 steps (24 passed)
0m00.076s (executing steps: 0m00.040s)
```

To recap, cucumber-tsflow extends cucumber-js, which means that all options and features provided by cucumber-js are supported with cucumber-tsflow. In other words, when executing tests using cucumber-tsflow the underlying cucumber API is actually used to run the tests.

### Executing with script in package.json

You can also add a script to package.json to execute the tests as shown below:

```json
"scripts": {
	"test": "cucumber-tsflow -p default"
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

As mentioned, when using cucumber-tsflow to execute tests all of the configuration options documented here are supported: <https://github.com/cucumber/cucumber-js/blob/v8.0.0/docs/configuration.md>

In addition to cucumber configuration options the following two options have been added:

| Name         | Type     | Repeatable | CLI Option     | Description                                                   | Default |
| ------------ | -------- | ---------- | -------------- | ------------------------------------------------------------- | ------- |
| `transpiler` | `string` | No         | `--transpiler` | Name of the transpiler to use: esnode, esvue, tsnode or tsvue | esnode  |
| `debugFile`  | `string` | No         | `--debug-file` | Path to a file with steps for debugging                       |         |

#### Transpiler and Vue3 supported

Using TypeScript with cucumberJs requires a couple of tsconfig.json parameters as described here: [Transpiling](https://github.com/cucumber/cucumber-js/blob/v9.1.0/docs/transpiling.md)

As a result, cucumber-tsflow adds several configurations for transpiling TypeScript code using the recommended configuration. In addition, support has been added to transform .vue files during test execution allowing you to test Vue SFC components using cucumber.

The following transpilers are provided:

- **esnode**: Uses esbuild to transpile TypeScript code for node test execution.
- **esvue**: Uses esbuild to transpile TypeScript code and adds a hook for .vue files, which transforms Vue SFC components into commonJS.
  - **jsdom** is also loaded globally to support loading and testing Vue SFC components.
- **tsnode**: Uses typescript to transpile TypeScript code for node test execution.
- **tsvue**: Uses typescript to transpile TypeScript code and adds a hook for .vue files, which transforms Vue SFC components into commonJS.
  - **jsdom** is also loaded globally to support loading and testing Vue SFC components.

##### Using the transpiler configuration option

When configuring cucumber to execute tests you can specify which transpiler to use with the `transpiler` configuration option as shown below:

```json
{
	"default": {
		"transpiler": "esvue"
	}
}
```

##### Alternate without using the transpiler option

You can also use the `requireModule` parameter to configure a transpiler. The following example shows how to configure cucumber to use the `esvue` transpiler with the `requireModule` option.

```json
{
	"default": {
		"requireModule": ["@lynxwall/cucumber-tsflow/lib/esvue"]
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
	"type": "node",
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
	"program": "${workspaceRoot}/node_modules/@lynxwall/cucumber-tsflow/bin/cucumber-tsflow",
	"stopOnEntry": true,
	"args": ["--debug-file", "${file}", "-p", "default"],
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

```javascript
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

but it can be easily done through CucumberJS `setDefaultTimeout` function.

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

Changing the formatter used for generating json along with changing the Snippet Syntax can be done through the CucumberJS configuration file.

If it doesn't already exist, create a file named cucumber.json at the root of your project. This is where we can configure different options for CucumberJS.

#### Using the behave json formatter

The following example shows how to configure the behave formatter in cucumber.json. The tsflow-snippet-syntax module is configured as the default snippet syntax and does not require configuration. However, you can override the snippet syntax as documented here: <https://github.com/cucumber/cucumber-js/blob/v8.0.0/docs/custom_snippet_syntaxes.md>

```javascript
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

```javascript
{
	"default": {
		"format": [
			"junitbamboo:cucumber_report.xml"
		]
	}
}
```

## Sharing Data between Bindings

### Context Injection

Like 'specflow', cucumber-tsflow supports a simple dependency injection framework that will instantitate and inject class instances into 'binding' classes for each execuing scenario.

To use context injection:

- Create simple classes representing the shared data (they _must_ have default constructors)
- Define a constructor on the 'binding' classes that will require the shared data that accepts the context objects as parameters
- Update the `@binding()` decorator to indicate the types of context objects that are required by the 'binding' class

```javascript
import { binding, given, when } from '@lynxwall/cucumber-tsflow';
import { Workspace } from './workspace';
import { expect } from 'chai';

@binding([Workspace])
export default class InjectionTestSteps1 {
	constructor(private workspace: Workspace) {}

	@given('The Workspace is available and valid')
	theWorkspaceIsAvailableAndValid() {
		expect(this.workspace).not.to.be.undefined;
		expect(this.workspace.world).not.to.be.undefined;
	}

	@when('I change the workspace in one step definition class')
	whenIChangeTheWorkspaceInOneStep() {
		this.workspace.someValue = 'value changed';
	}
}
```

### Access to Cucumber.js World object

The context object that you inject can also be configured to access the [World](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/world.md) object from Cucumber.js, which provides a method for adding attachments, a method for logging information from hooks/steps and an object of parameters passed in via configuration.

The first step is to define a world property on the class that you're injecting:

```javascript
import { World } from '@cucumber/cucumber';

export class Workspace {
	public world!: World;
	public someValue = '';
}
```

Next you'll need to initialize the world property in a **_@before_** hook so that it's available to all steps in a scenario. My approach is to add a new file to the steps folder that is dedicated to initializing the class (Workspace in this example) in a **_@before_** hook.

For this example I've added a file named world-context.ts with the following content:

```javascript
import { binding, before } from '@lynxwall/cucumber-tsflow';
import { Workspace } from './workspace';
import { World } from '@cucumber/cucumber';

@binding([Workspace])
export default class WorldContext {
	_worldObj?: World;

	constructor(private workspace: Workspace) {}

	@before()
	beforeScenario() {
		this.workspace.world = this._worldObj as World;
	}
}
```

As described in the section on Hooks, the **_beforeScenario_** function will be executed before each scenario. We're accessing a member property that was bound to the class instance during creation of each step class, and initializing the world property.

**NOTE:** Examples of this and other tests can be found in the GitHub repository.
