import { closeSync, constants, fchmodSync, fstatSync, lstatSync, openSync, unlinkSync, writeSync } from "node:fs";

import { shredFile } from "../shred-file/index.js";
import type { FileIdentity } from "./credentials-file.type.js";

/**
 * Write `text` to `path` as a file only its owner can read (mode `0600`, set again on the open file so a loose `umask`
 * cannot widen it), and return which file that is, with its descriptor still open, so cleanup can remove only it. It
 * will not replace a file that is already there unless `force` is set; a forced replacement first overwrites the old
 * file's contents with zeros, so the tokens of an earlier run are not left recoverable. Throws when it cannot write, and
 * then removes the file it had just created and closes it, so a failed write never leaves plaintext tokens behind. A
 * file that already existed is never touched by that cleanup. Windows does not honour these modes, so the caller does
 * not use this there. `write` is how the text is written; it is a parameter so a test can make the write fail after the
 * file exists.
 */
export function writeCredentialsFile(
	path: string,
	text: string,
	force = false,
	write: (fd: number, text: string) => unknown = writeSync
): FileIdentity {
	if (force) clearExisting(path);
	// `wx` fails if the path exists (a symlink included), so nothing below can follow a planted link.
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

/** Zero and remove whatever is at `path`, without following a symlink; nothing there is fine. */
function clearExisting(path: string): void {
	let old;
	try {
		old = lstatSync(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
		throw err;
	}
	if (!old.isFile()) {
		// A symlink or anything else: remove the entry itself and leave what it points to.
		unlinkSync(path);
		return;
	}
	const fd = openSync(path, constants.O_WRONLY | constants.O_NOFOLLOW);
	const { dev, ino } = fstatSync(fd);
	shredFile(path, { dev, ino, fd });
}
