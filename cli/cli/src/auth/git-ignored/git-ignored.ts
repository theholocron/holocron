import { execFileSync } from "node:child_process";
import { dirname } from "node:path";

/**
 * Whether git ignores `path`: `true` when a rule ignores it, `false` when git would track it, and `null` when there
 * is no answer (the path is not in a git repository, or git is not installed). Reads only; it changes nothing.
 */
export function isGitIgnored(path: string): boolean | null {
	try {
		execFileSync("git", ["check-ignore", "-q", "--", path], { cwd: dirname(path), stdio: "ignore" });
		return true;
	} catch (err) {
		return (err as { status?: number }).status === 1 ? false : null;
	}
}
