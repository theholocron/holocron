import { statSync, unlinkSync, writeFileSync } from "node:fs";

/**
 * Overwrite `path` with zeros and remove it, so the tokens it held are not left in a deleted-but-recoverable file.
 * Best effort: a journaling or copy-on-write filesystem and an SSD may keep older blocks that an overwrite does not
 * reach, which is why the file is also kept private and short-lived. A file that is already gone is not an error.
 * `remove` is how the file is deleted; it is a parameter so a test can look at the file just before it goes.
 */
export function shredFile(path: string, remove: (path: string) => void = unlinkSync): void {
	try {
		writeFileSync(path, Buffer.alloc(statSync(path).size), { flag: "r+" });
	} catch {
		// Missing or unwritable: fall through to removing it.
	}
	try {
		remove(path);
	} catch {
		// Already gone.
	}
}
