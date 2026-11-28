import { type TasksConfig } from "@theholocron/astromech/config";
import type { GitHubClient } from "@theholocron/github-client";

export type ValidateConfigResult =
	| { status: "valid"; filepath: string; config: TasksConfig }
	| { status: "no-config" }
	| { status: "unknown-tasks"; filepath: string; unknownTasks: string[] }
	| { status: "load-error"; filepath: string; message: string };

export interface ValidateConfigInput {
	client: Pick<GitHubClient, "git">;
	/** `"owner/repo"`. */
	repo: string;
	/** A specific commit/branch to validate instead of the default branch. See the module docstring for what a `ref`-based result may (and may not) be used for. */
	ref?: string;
	/** Read again even when a recent read is kept: for a caller that writes persistent state from the result. */
	fresh?: boolean;
	/** Epoch milliseconds; now when left out. For tests. */
	now?: number;
}
