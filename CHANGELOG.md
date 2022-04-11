# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

Please see [CONTRIBUTING.md](https://github.com/LynxWall/cucumber-js-tsflow/blob/master/CONTRIBUTE.md) on how to contribute to cucumber-tsflow.

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
