import { execFileSync } from "node:child_process";
import { dirname } from "node:path";

import type { GitIgnoreState } from "./git-ignored.type.js";

/**
 * Ask git whether it ignores `path` (see {@link GitIgnoreState}). A caller that must not leave a file where it could be
 * committed accepts only `ignored` and `no-repo`. Reads only; it changes nothing.
 */
export function isGitIgnored(path: string): GitIgnoreState {
	try {
		execFileSync("git", ["check-ignore", "-q", "--", path], {
			cwd: dirname(path),
			stdio: ["ignore", "ignore", "pipe"],
		});
		return "ignored";
	} catch (err) {
		const { status, code, stderr } = err as { status?: number; code?: string; stderr?: Buffer };
		if (code === "ENOENT") return "no-repo";
		if (status === 1) return "tracked";
		return status === 128 && /not a git repository/i.test(String(stderr)) ? "no-repo" : "unknown";
	}
}
