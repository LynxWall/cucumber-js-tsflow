import * as sourceMapSupport from 'source-map-support';

/**
 * Represents a callsite of where a step binding is being applied.
 */
export class Callsite {
	private static cwd = process.cwd();
	/**
	 * Initializes a new [[Callsite]].
	 *
	 * @param filename The filename of the callsite.
	 * @param lineNumber The line number of the callsite.
	 */
	constructor(public filename: string, public lineNumber: number) {}

	/**
	 * Returns a string representation of the callsite.
	 *
	 * @returns A string representing the callsite formatted with the filename and line
	 * number.
	 */
	public toString(): string {
		return `${this.filename}:${this.lineNumber}`;
	}

	private static callsites() {
		const _prepareStackTrace = Error.prepareStackTrace;
		Error.prepareStackTrace = (_, stack) => stack;
		const stack = new Error().stack?.slice(1) ?? ['', '', 'unknown'];
		Error.prepareStackTrace = _prepareStackTrace;
		return stack;
	}
	/**
	 * Captures the current [[Callsite]] object.
	 */
	public static capture(): Callsite {
		const stack = Callsite.callsites()[2];
		const tsStack = sourceMapSupport.wrapCallSite(stack);
		const ourCallsite = new Callsite(tsStack.getFileName() || '', tsStack.getLineNumber() || -1);
		ourCallsite.filename = ourCallsite.filename.replace(`${this.cwd}\\`, '');

		return ourCallsite;
	}
}
