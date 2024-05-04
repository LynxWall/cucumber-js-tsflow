import * as messages from '@cucumber/messages';
import { World } from '@cucumber/cucumber';

/**
 * Represents a class that will be injected into a binding class to provide context
 * during the execution of a Cucumber scenario.
 */
export interface ContextType {
	/**
	 * A default constructor.
	 */
	new (worldObj: World): any;
}

/**
 * Parameter passed into initialize() at the
 * start of a test case (scenario) before most
 * hooks and all steps
 */
export interface StartTestCaseInfo {
	gherkinDocument: messages.GherkinDocument;
	pickle: messages.Pickle;
	testCaseStartedId: string;
}

/**
 * Parameter passed into dispost() at the
 * end of a test case (scenario) after the
 * last After hook has executed.
 */
export interface EndTestCaseInfo {
	gherkinDocument: messages.GherkinDocument;
	pickle: messages.Pickle;
	result: messages.TestStepResult;
	willBeRetried: boolean;
	testCaseStartedId: string;
}
