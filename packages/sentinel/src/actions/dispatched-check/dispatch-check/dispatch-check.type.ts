import type { GitHubClient } from "@theholocron/github-client";

export interface DispatchCheckInput {
	client: Pick<GitHubClient, "checks" | "workflows">;
	/** `"owner/repo"` — the repo the task actually runs against, not `theholocron/.github`. */
	repo: string;
	/** The commit SHA the queued check run attaches to. */
	headSha: string;
	/** Ref (branch or SHA) the dispatched workflow checks out — usually the same commit as `headSha`. */
	ref: string;
	/** The `astromech` task name to run, e.g. `"verification.typeSafety"`. */
	task: string;
	/** Check run name, e.g. `"Verification / Type Safety / Run tsc --noEmit"` — same naming convention as every other Sentinel-posted check. No "Sentinel /" prefix: GitHub's own check-run detail page already shows the posting App's name ahead of this. */
	checkName: string;
}

export interface DispatchCheckResult {
	checkRunId: number;
	htmlUrl: string;
}
