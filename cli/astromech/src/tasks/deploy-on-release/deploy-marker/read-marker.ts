import type { Run } from "../../../utils/index.js";
import type { MarkerRead } from "./deploy-marker.type.js";

/**
 * Reads the deploy marker `tag` and checks it is an ancestor of `to`, so a rewritten history never makes the
 * diff meaningless. A missing tag is not an error: it is a package that has no recorded deploy yet.
 */
export function readMarker(run: Run, cwd: string, tag: string, to: string): MarkerRead {
	const found = run("git", ["rev-parse", "--quiet", "--verify", `refs/tags/${tag}^{commit}`], { cwd });
	const sha = found.stdout.trim();
	if (found.status !== 0 || !sha) return {};
	const ancestor = run("git", ["merge-base", "--is-ancestor", sha, to], { cwd });
	return ancestor.status === 0
		? { sha }
		: { note: `${tag} (${sha.slice(0, 7)}) is not an ancestor of ${to}; ignoring it` };
}
