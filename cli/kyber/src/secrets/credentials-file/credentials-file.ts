import { randomBytes } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, renameSync, unlinkSync, writeSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { createPrivateFile } from "../private-file/index.js";
import { shredFile } from "../shred-file/index.js";
import type { FileIdentity } from "./credentials-file.type.js";

/**
 * Write `text` to `path` as a file only its owner can read (mode `0600`), and return which file that is, with its
 * descriptor still open, so cleanup can remove only it. Without `force` it will not replace a file that is already
 * there. A write that fails removes the file it had just created, so a failed write never leaves plaintext tokens behind.
 *
 * With `force` the replacement is written to a temporary file beside `path` first and then renamed over it, which is
 * atomic, so a replacement that cannot be written or swapped in leaves the old file exactly as it was. Only once the
 * new file is in place is the old file's content overwritten with zeros through a descriptor opened on it before the
 * swap, so the tokens of an earlier run are not left recoverable. A symlink at `path` is replaced, not followed.
 *
 * Windows does not honour these modes, so the caller does not use this there. `write` is how the text is written; it is
 * a parameter so a test can make the write fail after the file exists.
 */
export function writeCredentialsFile(
	path: string,
	text: string,
	force = false,
	write: (fd: number, text: string) => unknown = writeSync
): FileIdentity {
	if (!force) return createPrivateFile(path, text, write);

	const old = openExisting(path);
	const temp = join(dirname(path), `${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
	let fresh: FileIdentity;
	try {
		fresh = createPrivateFile(temp, text, write);
		try {
			renameSync(temp, path);
		} catch (err) {
			closeSync(fresh.fd);
			unlinkSync(temp);
			throw err;
		}
	} catch (err) {
		if (old) closeSync(old.fd);
		throw err;
	}
	// The path now names the new file, so this zeroes and closes the old one and leaves the path alone.
	if (old) shredFile(path, old);
	return fresh;
}

/** A descriptor for the regular file at `path`, opened without following a symlink, or `undefined` if there is none. */
function openExisting(path: string): FileIdentity | undefined {
	let stat;
	try {
		stat = lstatSync(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw err;
	}
	// A symlink or anything else is replaced by the rename itself; only a regular file has contents to zero.
	if (!stat.isFile()) return undefined;
	const fd = openSync(path, constants.O_WRONLY | constants.O_NOFOLLOW);
	const { dev, ino } = fstatSync(fd);
	return { dev, ino, fd };
}
