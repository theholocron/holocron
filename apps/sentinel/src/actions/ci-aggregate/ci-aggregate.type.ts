/**
 * Whether Sentinel computes the `ci` aggregate (spec `process-sentinel-posts-ci`, SPEC-0099). `off` is the default and does
 * nothing; `shadow` posts under `ci / Required checks (sentinel)` beside the Actions poller, which is not required; `on`
 * posts the real `ci / Required checks` for a pull request whose head says `ci.aggregate: sentinel` and the shadow for
 * every other, so a commit has exactly one poster of the real check.
 */
export type CiAggregateMode = "off" | "shadow" | "on";

/** The deployment binding that turns the aggregate on: `SENTINEL_CI_AGGREGATE=shadow` or `=on`. Unset, or any other value, is `off`. */
export interface CiAggregateEnv {
	SENTINEL_CI_AGGREGATE?: string;
}

/** What a delivery asks of the aggregate, normalized from the webhook event. */
export interface CiAggregateTrigger {
	/**
	 * `pull_request` (opened, pushed to, reopened, ready: post the check at once), `check_run` (a check finished),
	 * `rerequested` (the Re-run button), or `status` (a commit status changed).
	 */
	kind: "pull_request" | "check_run" | "rerequested" | "status";
	/** The commit the delivery is about; a delivery for a commit that is no longer the head is dropped. */
	sha?: string;
	/** The check run's name or the status's context; a `check_run` or `status` that is not one the aggregate waits for is dropped. */
	name?: string;
	/** The pull requests the delivery names, each with its base branch when the payload gave one. */
	pullRequests: Array<{ number: number; baseRef?: string }>;
	/** The branches a `status` says the commit is the head of, used to find its pull requests. */
	branches: string[];
}
