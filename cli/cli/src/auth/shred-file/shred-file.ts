import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, unlinkSync, writeSync } from "node:fs";

import type { FileIdentity, ShredOutcome } from "../credentials-file/credentials-file.type.js";

/**
 * Overwrite the file at `path` with zeros and remove it, so the tokens it held are not left in a deleted-but-recoverable
 * file. It only touches the file `identity` names: if the path is now a different file, or not a regular file, it is
 * left alone (`replaced`), so a file swapped in by another process, or another export's file, is never zeroed. The
 * overwrite does not follow a symlink. A file that is already gone is `missing`, not an error; any other failure to
 * remove it throws, so the caller never reports a file as deleted while it is still there.
 *
 * The overwrite is best effort: a journaling or copy-on-write filesystem and an SSD may keep older blocks it does not
 * reach, which is why the file is also kept private and short-lived. One that fails does not stop the removal.
 * `remove` is how the file is deleted; it is a parameter so a test can look at the file just before it goes.
 */
export function shredFile(
	path: string,
	identity: FileIdentity,
	remove: (path: string) => void = unlinkSync
): ShredOutcome {
	let stat;
	try {
		stat = lstatSync(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return "missing";
		throw err;
	}
	if (!stat.isFile() || stat.dev !== identity.dev || stat.ino !== identity.ino) return "replaced";
	try {
		const fd = openSync(path, constants.O_WRONLY | constants.O_NOFOLLOW);
		try {
			const now = fstatSync(fd);
			// Opened through a path that may have been swapped since the check: only zero the file that was named.
			if (now.dev === identity.dev && now.ino === identity.ino) {
				writeSync(fd, Buffer.alloc(now.size));
				fsyncSync(fd);
			}
		} finally {
			closeSync(fd);
		}
	} catch {
		// Unwritable: still remove it below.
	}
	remove(path);
	return "deleted";
}
