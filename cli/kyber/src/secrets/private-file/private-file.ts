import { closeSync, fchmodSync, fstatSync, openSync, unlinkSync, writeSync } from "node:fs";

import type { FileIdentity } from "../credentials-file/credentials-file.type.js";

/**
 * Create `path` as a new file only its owner can read (mode `0600`, set again on the open file so a loose `umask`
 * cannot widen it), write `text` to it and return which file it is, with its descriptor left open. It fails if the path
 * exists, a symlink included, so nothing is written through a planted link or over a file that is there. When the
 * write fails after the file exists, it closes and removes that file, so no plaintext is left behind. `write` is how the
 * text is written; it is a parameter so a test can make the write fail.
 */
export function createPrivateFile(
	path: string,
	text: string,
	write: (fd: number, text: string) => unknown = writeSync
): FileIdentity {
	const fd = openSync(path, "wx", 0o600);
	try {
		write(fd, text);
		fchmodSync(fd, 0o600);
		const { dev, ino } = fstatSync(fd);
		return { dev, ino, fd };
	} catch (err) {
		closeSync(fd);
		try {
			unlinkSync(path);
		} catch {
			// Could not remove it either: the original error is the one to report.
		}
		throw err;
	}
}
