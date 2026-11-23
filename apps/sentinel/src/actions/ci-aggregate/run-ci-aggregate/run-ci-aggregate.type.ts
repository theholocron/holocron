import type { GitHubClient } from "@theholocron/github-client";

import type { CiAggregateEnv, CiAggregateTrigger } from "../ci-aggregate.type.js";

/** What {@link runCiAggregate} needs. */
export interface RunCiAggregateInput {
	/** The installation client of the repository the delivery is about. */
	client: GitHubClient;
	/** The deployment's bindings. */
	env: CiAggregateEnv;
	/** `owner/repo`. */
	repo: string;
	/** What the delivery asks. */
	trigger: CiAggregateTrigger;
	/** Epoch milliseconds; now when left out. */
	now?: number;
	/** The name the check is posted under; the shadow name by default. */
	name?: string;
}

/** One pull request the run posted on. */
export interface CiAggregatePosted {
	/** The pull request's number. */
	number: number;
	/** What was done: created, updated, recreated or unchanged. */
	action: string;
	/** The verdict the check now says. */
	conclusion: "pending" | "success" | "failure";
	/** The head commit the check is on. */
	sha: string;
	/** The id of the check run the verdict is on, `null` when none was written. */
	runId: number | null;
	/** Whether it is the real `ci / Required checks` (the head says `sentinel`), not the shadow. */
	real: boolean;
}

/** `skipped` is a normal state (off, nothing to compute), `fail` an error the delivery should report. */
export type RunCiAggregateResult =
	| { status: "skipped"; reason: string }
	| { status: "ok"; posted: CiAggregatePosted[]; skipped: Array<{ number: number; reason: string }> }
	| { status: "fail"; reason: string };
