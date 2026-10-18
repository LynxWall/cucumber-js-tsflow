import { IRunEnvironment, makeEnvironment as makeCucumberEnvironment } from '@cucumber/cucumber/lib/environment/index';
import { withDriveLetterOf } from '../utils/paths';

/** What CucumberJS's `makeEnvironment` returns: the environment with every default filled in, plus a logger. */
export type UsableEnvironment = ReturnType<typeof makeCucumberEnvironment>;

/**
 * CucumberJS's `makeEnvironment`, with the working directory's drive letter spelled as in this library's own
 * location. The support and feature paths are resolved against the working directory and the support files are
 * loaded by those paths, so a working directory whose drive letter differs in case from the path this library was
 * loaded from (`process.cwd()` is uppercase, a path an API caller passes need not be, and neither need match the
 * caller's own script path) would have the support files import a second copy of the library and of CucumberJS,
 * whose builder is never reset: `You're calling functions (e.g. "Given") on an instance of Cucumber that isn't
 * running (status: PENDING)`. Every entry point that takes an `IRunEnvironment` makes its environment here; the bin
 * applies the same rule the other way round, loading the library through a path spelled like the working directory.
 */
export function makeEnvironment(provided: IRunEnvironment): UsableEnvironment {
	const made = makeCucumberEnvironment(provided);
	return { ...made, cwd: withDriveLetterOf(made.cwd, __dirname) };
}
