import { statSync } from 'node:fs';

/**
 * What is remembered about a file to tell later whether it has changed: its size and modification time, the
 * two `stat` fields that change whenever the content does and cost nothing to read. The selective-load index
 * records one per project module and the transpile cache's prune scan orders its entries by one.
 */
export interface FileStamp {
	mtimeMs: number;
	size: number;
}

/** The stamp of `file`, or undefined when it is not a regular file that can be stat'd. */
export function stampOf(file: string): FileStamp | undefined {
	try {
		const stat = statSync(file);
		return stat.isFile() ? { mtimeMs: stat.mtimeMs, size: stat.size } : undefined;
	} catch {
		return undefined;
	}
}

/** Whether two stamps record the same size and modification time. */
export function sameStamp(a: FileStamp, b: FileStamp): boolean {
	return a.mtimeMs === b.mtimeMs && a.size === b.size;
}
