import { closeSync, fstatSync, fsyncSync, lstatSync, unlinkSync, writeSync } from "node:fs";

import type { FileIdentity, ShredOutcome } from "../credentials-file/credentials-file.type.js";

/**
 * Overwrite the file `identity` names with zeros, close it, and remove it from `path`, so the tokens it held are not
 * left in a deleted-but-recoverable file.
 *
 * The overwrite goes through the descriptor held since the file was written, not through the path, so it zeroes that
 * file wherever the path points now and never follows a symlink: a symlink or another file swapped in is not touched.
 * The path itself is removed only if it is still that file (same device and inode, which the held descriptor keeps
 * from being reused); otherwise it is left alone (`replaced`), so a file another process put there, or another
 * export's file, survives. A path that is already gone is `missing`, not an error; any other failure to remove it
 * throws, so the caller never reports a file as deleted while it is still there.
 *
 * The overwrite is best effort: a journaling or copy-on-write filesystem and an SSD may keep older blocks it does not
 * reach, which is why the file is also kept private and short-lived. One that fails does not stop the removal.
 * `remove` is how the path is deleted; it is a parameter so a test can look at the file just before it goes.
 */
export function shredFile(
	path: string,
	identity: FileIdentity,
	remove: (path: string) => void = unlinkSync
): ShredOutcome {
	let missing = false;
	let same = false;
	try {
		try {
			const { size } = fstatSync(identity.fd);
			writeSync(identity.fd, Buffer.alloc(size), 0, size, 0);
			fsyncSync(identity.fd);
		} catch {
			// Unwritable: still remove it below.
		}
		// Compared while the descriptor is still open, so the inode cannot have been freed and handed to another file.
		const stat = lstatSync(path);
		same = stat.isFile() && stat.dev === identity.dev && stat.ino === identity.ino;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
		missing = true;
	} finally {
		try {
			closeSync(identity.fd);
		} catch {
			// Already closed.
		}
	}
	if (missing) return "missing";
	if (!same) return "replaced";
	remove(path);
	return "deleted";
}
