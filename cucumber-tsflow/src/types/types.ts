/**
 * A string representation of a [[RegExp]] that defines a Cucumber step pattern.
 */
export type StepPattern = string;

/**
 * A Cucumber tag name.
 */
export type TagName = string;

export type TypeDecorator = <T>(target: { new (...args: any[]): T }) => void;
