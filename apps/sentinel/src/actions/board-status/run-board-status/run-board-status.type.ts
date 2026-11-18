import type { GitHubClient } from "@theholocron/github-client";

import type { BoardStatusTrigger } from "../board-status.type.js";
import type { BoardStatusEnv, LoadBoardStatusInput, LoadBoardStatusResult } from "../load-board-status/index.js";

export interface RunBoardStatusInput {
	/** The installation client of the repository the delivery is about. */
	client: GitHubClient;
	env: BoardStatusEnv;
	/** `owner/repo`. */
	repo: string;
	trigger: BoardStatusTrigger;
	/** Replaces the provider loader, for tests. */
	loadBoard?: (input: LoadBoardStatusInput) => Promise<LoadBoardStatusResult>;
}

/** One status the handler set. */
export interface BoardStatusApplied {
	board: string;
	/** The item's `issues` key. */
	key: string;
	from?: string;
	to: string;
}

/** One item the handler could not move; logged, never a failed delivery. */
export interface BoardStatusFailure {
	board: string;
	key: string;
	message: string;
}

/**
 * `skipped` is a normal state (not set up, nothing to say, no issue closed), `ok` lists what changed (empty on a
 * redelivery) and what failed per item, `fail` is an unexpected error. None of them is answered with an error status.
 */
export type RunBoardStatusResult =
	| { status: "skipped"; reason: string }
	| { status: "ok"; applied: BoardStatusApplied[]; failed: BoardStatusFailure[] }
	| { status: "fail"; reason: string };
