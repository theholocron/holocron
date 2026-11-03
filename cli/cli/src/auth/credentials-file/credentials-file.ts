import { chmodSync, unlinkSync, writeFileSync } from "node:fs";

/**
 * Write `text` to `path` as a file only its owner can read (mode `0600`, set again after the write so a loose
 * umask cannot widen it). It will not replace a file that is already there unless `force` is set, so a token file
 * from an earlier run, or an unrelated file, is never overwritten by accident. Throws when it cannot write.
 */
export function writeCredentialsFile(path: string, text: string, force = false): void {
	if (force) {
		try {
			unlinkSync(path);
		} catch {
			// Nothing to replace.
		}
	}
	writeFileSync(path, text, { mode: 0o600, flag: "wx" });
	chmodSync(path, 0o600);
}
