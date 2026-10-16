import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after } from 'node:test';

/**
 * A fresh directory under the OS temp directory, removed when the test file finishes. Temp paths are project
 * paths as far as the library is concerned (not under `node_modules`, not inside the package), which is what
 * the module-graph and selective-load tests need.
 */
export function temporaryDirectory(prefix: string): string {
	const directory = mkdtempSync(path.join(tmpdir(), `tsflow-${prefix}-`));
	after(() => rmSync(directory, { recursive: true, force: true }));
	return directory;
}
