import { closeSync, fchmodSync, fstatSync, lstatSync, openSync, unlinkSync, writeSync } from "node:fs";

import { shredFile } from "../shred-file/index.js";
import type { FileIdentity } from "./credentials-file.type.js";

/**
 * Write `text` to `path` as a file only its owner can read (mode `0600`, set again on the open file so a loose `umask`
 * cannot widen it), and return which file that is so cleanup can remove only it. It will not replace a file that is
 * already there unless `force` is set; a forced replacement first overwrites the old file's contents with zeros, so
 * the tokens of an earlier run are not left recoverable. Throws when it cannot write, and then removes the file it had
 * just created, so a failed write never leaves plaintext tokens behind. A file that already existed is never touched
 * by that cleanup. Windows does not honour these modes, so the caller does not use this there. `write` is how the text
 * is written; it is a parameter so a test can make the write fail after the file exists.
 */
export function writeCredentialsFile(
	path: string,
	text: string,
	force = false,
	write: (fd: number, text: string) => unknown = writeSync
): FileIdentity {
	if (force) {
		try {
			const old = lstatSync(path);
			shredFile(path, { dev: old.dev, ino: old.ino });
			// Not a regular file (a symlink, say): shredFile left it, so remove the link itself.
			if (!old.isFile()) unlinkSync(path);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
		}
	}
	// `wx` fails if the path exists (a symlink included), so nothing below can follow a planted link.
	const fd = openSync(path, "wx", 0o600);
	try {
		write(fd, text);
		fchmodSync(fd, 0o600);
		const { dev, ino } = fstatSync(fd);
		return { dev, ino };
	} catch (err) {
		try {
			unlinkSync(path);
		} catch {
			// Could not remove it either: the original error is the one to report.
		}
		throw err;
	} finally {
		closeSync(fd);
	}
}
