import { fstatSync, type Stats } from "node:fs";

import type { AuthExportOutKind } from "../auth-export.type.js";

/**
 * What file descriptor `fd` (stdout) is, for deciding where tokens may go: a `terminal`, a `pipe` (a FIFO, or the
 * socket some shells and runners use for one), or `other` (a regular file, a device, or anything that cannot be
 * inspected). Only a pipe is safe to write the lines to, so anything unknown is `other`.
 */
export function stdoutKind(
	isTerminal: boolean,
	fd = 1,
	stat: (fd: number) => Pick<Stats, "isFIFO" | "isSocket"> = fstatSync
): AuthExportOutKind {
	if (isTerminal) return "terminal";
	try {
		const s = stat(fd);
		return s.isFIFO() || s.isSocket() ? "pipe" : "other";
	} catch {
		return "other";
	}
}
