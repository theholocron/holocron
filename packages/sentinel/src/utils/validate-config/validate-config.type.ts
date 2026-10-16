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
}

export type DedicatedTasksResult =
	{ status: "found" | "absent"; config?: TasksConfig } | { status: "load-error"; filepath: string; message: string };
