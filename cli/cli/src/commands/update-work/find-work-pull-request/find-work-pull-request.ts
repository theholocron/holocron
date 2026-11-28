import type { PullRequest } from "../../../plugin/index.js";
import { issueRef } from "../../start-work/work-branch/index.js";

/**
 * The open pull requests of a piece of work, found by the branch name `start work` gives them
 * (`<type>/<issue>-<slug>`, the issue's number or lower-cased key after the first slash), in the order given (newest
 * first from `listPullRequests`). A branch named another way is not found; `--pr` names the pull request then.
 */
export function findWorkPullRequests(prs: readonly PullRequest[], issue: string): PullRequest[] {
	const ref = issueRef(issue);
	if (!ref) return [];
	const prefix = `${ref}-`;
	return prs.filter((pr) => {
		if (pr.state !== "open") return false;
		const slash = pr.branch.indexOf("/");
		return (
			slash > 0 &&
			pr.branch
				.slice(slash + 1)
				.toLowerCase()
				.startsWith(prefix)
		);
	});
}
