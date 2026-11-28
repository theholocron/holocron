import type { GitHubClient } from "@theholocron/github-client";

import type { LoadPrFeedInput, LoadPrFeedResult, PrFeedEnv } from "../load-pr-feed/index.js";
import type { PrFeedTrigger } from "../pr-feed.type.js";
import type { PrFeedPullResult } from "../sync-pull-request/index.js";

export interface RunPrFeedInput {
	/** The installation client of the repository the delivery is about. */
	client: GitHubClient;
	env: PrFeedEnv;
	/** `owner/repo`. */
	repo: string;
	trigger: PrFeedTrigger;
	/** The time the ages are counted to; now when left out. */
	now?: Date;
	/** Replaces the provider loader, for tests. */
	loadFeed?: (input: LoadPrFeedInput) => Promise<LoadPrFeedResult>;
}

/** `skipped` is a normal state (not set up, excluded, nothing to say), `fail` an error the delivery should report. */
export type RunPrFeedResult =
	| { status: "skipped"; reason: string }
	| { status: "ok"; pulls: PrFeedPullResult[] }
	| { status: "fail"; reason: string };
