import type { RunGit } from "@theholocron/kyber/git";

import { issueRef } from "../../start-work/work-branch/index.js";

/**
 * The local branches named for an issue, `<type>/<issue>-<slug>` (the rule `start work` follows), for the work that has
 * no pull request to name its branch. Empty for a key with no usable form.
 */
export function findWorkBranches(git: RunGit, cwd: string, issue: string): string[] {
	const ref = issueRef(issue);
	if (!ref) return [];
	const out = git(["for-each-ref", "--format=%(refname:short)", "refs/heads/"], cwd);
	return out
		.split("\n")
		.map((name) => name.trim())
		.filter((name) => {
			const slash = name.indexOf("/");
			return slash > 0 && name.slice(slash + 1).startsWith(`${ref}-`);
		});
}
