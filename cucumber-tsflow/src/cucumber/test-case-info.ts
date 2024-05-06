import type { GherkinDocument, Pickle, TestStepResult } from '@cucumber/messages';

/**
 * Parameter passed into initialize() at the
 * start of a test case (scenario) before most
 * hooks and all steps
 */
export interface StartTestCaseInfo {
	gherkinDocument: GherkinDocument;
	pickle: Pickle;
	testCaseStartedId: string;
}

/**
 * Parameter passed into dispost() at the
 * end of a test case (scenario) after the
 * last After hook has executed.
 */
export interface EndTestCaseInfo {
	gherkinDocument: GherkinDocument;
	pickle: Pickle;
	result: TestStepResult;
	willBeRetried: boolean;
	testCaseStartedId: string;
}
