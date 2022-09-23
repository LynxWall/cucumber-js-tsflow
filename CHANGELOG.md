# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

Please see [CONTRIBUTING.md](https://github.com/LynxWall/cucumber-js-tsflow/blob/master/CONTRIBUTE.md) on how to contribute to cucumber-tsflow.

## [5.1.2]

### Fixed

- Update to command line execution in README to use npx command.

## [5.1.1]

### Fixed

- Bug loading configuration files that was introduced with the latest update of Cucumber.js to version 8.6.0. Underlying cucumber libraries added a logging parameter to the beginning of several functions
  used by cucumber-tsflow.

### Changed

- Upgraded to Cucumber.js 8.6.0 and locked the reference to the current major.minor version. This should prevent breaking changes from Cucumber.js breaking cucumber-tsflow.
- Upgraded other packages to latest stable versions
- Updated tests to add the Cucumber.js World object to an injected context object.

### Added

- Example on how to access the Cucumber.js World object to README 

## [5.1.0]
### Fixed
- Fixed support for Parallel execution of tests.

### Changed
- Upgraded to cucumber.js 8.5.0
- Upgraded jsdom to latest version
- Upgraded other packages to latest stable versions

## [5.0.8]
### Fixed
- Removed slash import because some packages (Histoire) install latest esm only version. Replaced with code from slash package and added original author to MIT License.

## [5.0.7]
### Changed
- Switched to commonjs build instead of umd
- Package updates to latest version
- Removed callsites and implemented internally. Latest version of callsites is esm only, which doesn't work with tests.

### Fixed
- Hook examples in README

## [5.0.6]
### Changed
- README updates to specify that cucumber-tsflow command should be used for test execution.

### Added
- Examples and information to README

## [5.0.5]
### Fixed
- Issue with boolean parameter being added too early. Needs to be added once when code is transpiled.

### Added
- Boolean type tests

## [5.0.4]
### Fixed
- missing dependency short-uuid (had been added as devDependency)
  
### Added
- Note about only needing @cucumber/cucumber installed if using cucumber-js to execute tests instead of cucumber-tsflow

## [5.0.3]
### Fixed
- Line endings in bin/cucumber-tsflow to fix test issue in GitHub

## [5.0.2]
### Fixed
- README links
- Removed Vue dependency

## [5.0.1]
### Changed
- Removed ManagedScenarioContext from World object along with Before and After hooks used to manage it.

### Added
- Transpiler support using typescript or esbuild
- Vue transform support based on the vite/vue-plugin
- Cucumber message collector to manage the ManagedScenarioContext object
- RegEx matcher to match step expressions with feature step text. Supports all cucumber expressions along with regular expressions.
- BeforeStep and AfterStep hooks from cucumber with tests

### Fixed
- Parameter definitions for different hook functions to be consistent with cucumber
- Step tags to support same functionality as Cucumber hook tags

## [5.0.0]
### Changed
- BREAKING CHANGE! Renamed JavaScript components used for ts-node and Vue initialization along with snippet and behave formatters.
- Updated to @cucumber/cucumber version 8.0.0

### Added
- Implemented CLI and Cucumber Test runner in cucumber-tsflow using cucumber API and libraries
- Extended cucumber options to add environment (node or vue) and debugFile support
- Cucumber code library update so that summary and reports provide file name and line number of actual test and not location of binding in cucumber-tsflow
- Added support to dubg individual features associated with step file open in editor
- Boolean type for cucumber expressions
- behave tag support for formatter options used to generate json report compatible with Behave-Pro

### Fixed
- various Bugs

## [4.1.7]
### Changed
- Switched from happy-dom to jsdom because emitted events weren't bubbling up from dependent Vue components. Switching to jsdom fixed the issue.

## [4.1.5]
### Changed
- Vue transpiler updates

## [4.1.3]
### Changed
- Workflow and config updates

## [4.1.2]
### Added
- Support for transpiling Vue3 files in cucumber tests
- JavaScript scripts to initialize ts-node for stand-alone node execution or Vue3 execution with happy-dom
- Tests for Vue3 support
- Initial stub for cucumber-tsflow execution from node_modules/.bin

## [4.1.0]
### Added
- behave-json-formatter that fixes json so it can be used with Behave Pro
- tsflow-snippet-syntax used to format snippet examples
- BeforeAll and AfterAll Hooks
- WrapperOptions in step definitions
- Timeout in step definition and hooks

### Changed
- project restructure
- using version 8.0.0-rc.3 of @cucumber/cucumber

### Fixed
- Bugs related to tags

## [4.0.0]
Initial fork from [cucumber-tsflow](https://github.com/timjroberts/cucumber-js-tsflow)
