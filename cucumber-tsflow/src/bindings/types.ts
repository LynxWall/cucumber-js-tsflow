// tslint:disable:no-bitwise
import { World } from '@cucumber/cucumber';

/**
 * A string representation of a [[RegExp]] that defines a Cucumber step pattern.
 */
export type StepPattern = string;

/**
 * A Cucumber tag name.
 */
export type TagName = string;

/**
 * The CucumberJS step binding types.
 */
export enum StepBindingFlags {
	/**
	 * No bindings.
	 */
	none = 0,

	/**
	 * A 'Given' step definition binding.
	 */
	given = 1 << 0,

	/**
	 * A 'When' step definition binding.
	 */
	when = 1 << 1,

	/**
	 * A 'Then' step definition binding.
	 */
	then = 1 << 2,

	/**
	 * A 'Before' hook binding.
	 */
	before = 1 << 3,

	/**
	 * An 'After' hook binding.
	 */
	after = 1 << 4,

	/**
	 * An 'BeforeAll' hook binding
	 */
	beforeAll = 1 << 5,

	/**
	 * An 'AfterAll' hook binding
	 */
	afterAll = 1 << 6,

	/**
	 * An 'BeforeStep' hook binding
	 */
	beforeStep = 1 << 7,

	/**
	 * An 'AfterStep' hook binding
	 */
	afterStep = 1 << 8,

	/**
	 * All step definition bindings.
	 */
	StepDefinitions = StepBindingFlags.given | StepBindingFlags.when | StepBindingFlags.then,

	/**
	 * All hook bindings.
	 */
	Hooks = StepBindingFlags.before |
		StepBindingFlags.after |
		StepBindingFlags.beforeAll |
		StepBindingFlags.afterAll |
		StepBindingFlags.beforeStep |
		StepBindingFlags.afterStep
}

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
