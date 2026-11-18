import type { Run } from "../../../utils/index.js";

/**
 * Records that a package is deployed at `to`: moves the tag `tag` there and pushes it. Returns a problem line, or
 * `undefined` on success. The deploy already happened, so a failure here is a warning, not a failed deploy: the
 * worst case is that the next release deploys the package again.
 */
export function writeMarker(run: Run, cwd: string, tag: string, to: string): string | undefined {
	const made = run("git", ["tag", "--force", tag, to], { cwd });
	if (made.status !== 0) return `couldn't tag ${tag}: ${made.stderr.trim() || made.status}`;
	const pushed = run("git", ["push", "--force", "origin", `refs/tags/${tag}`], { cwd });
	return pushed.status === 0 ? undefined : `couldn't push ${tag}: ${pushed.stderr.trim() || pushed.status}`;
}
