import type { GitHubClient } from "@theholocron/github-client";

import type { AreaLabelsTrigger } from "../area-labels.type.js";
import type { ReadAreaConfigInput, ReadAreaConfigResult } from "../read-area-config/index.js";

export interface RunAreaLabelsInput {
	/** The installation client of the repository the delivery is about. */
	client: GitHubClient;
	/** `owner/repo`. */
	repo: string;
	trigger: AreaLabelsTrigger;
	/** Replaces the config reader, for tests. */
	readConfig?: (input: ReadAreaConfigInput) => Promise<ReadAreaConfigResult>;
}

/**
 * `skipped` is a normal state (no areas declared, a closed item), `ok` lists what was added (empty on a redelivery),
 * the wanted labels the repository lacks and the ones the cap left out, `fail` is an unexpected error. None of them
 * is answered with an error status.
 */
export type RunAreaLabelsResult =
	| { status: "skipped"; reason: string }
	| { status: "ok"; added: string[]; missing: string[]; dropped: string[] }
	| { status: "fail"; reason: string };
