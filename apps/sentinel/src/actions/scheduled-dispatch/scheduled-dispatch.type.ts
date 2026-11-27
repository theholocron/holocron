import type { GitHubClient } from "@theholocron/github-client";

import type { GitHubAppEnv } from "../../utils/github-app-credentials/index.js";

/** A workflow Sentinel starts on a schedule. */
export interface ScheduledTask {
	/** The workflow file to dispatch, as it is named under `.github/workflows`. */
	workflow: string;
}

/** The bindings the scheduled function reads, beside the App's credentials. */
export interface ScheduledDispatchEnv extends GitHubAppEnv {
	/** Vercel sends it as `Authorization: Bearer <value>` on a cron call. Unset, the function answers 503. */
	CRON_SECRET?: string;
	/** `owner/repo`, whose workflows are started. Unset, the function answers 404. */
	SENTINEL_REPO?: string;
}

/** What {@link runScheduledDispatch} needs. */
export interface RunScheduledDispatchInput {
	/** An installation client of the repository (`workflows` and `repos` are read). */
	client: Pick<GitHubClient, "repos" | "workflows">;
	/** `owner/repo`. */
	repo: string;
	/** The task id from the cron entry's query string. */
	task: string;
}

/** What a dispatch did. `unknown` is a task the table does not hold, `fail` an error from GitHub. */
export type RunScheduledDispatchResult =
	| { status: "unknown"; reason: string }
	| { status: "ok"; workflow: string; ref: string }
	| { status: "fail"; reason: string };

/** What {@link handleScheduledRequest} can replace, for tests. */
export interface HandleScheduledOptions {
	/** Finds the installation id of the App on a repository. Defaults to GitHub's `GET /repos/{repo}/installation`. */
	findInstallation?: (repo: string) => Promise<number | undefined>;
	/** Makes the installation client. Defaults to `createInstallationClient()`. */
	makeClient?: (installationId: number) => Promise<Pick<GitHubClient, "repos" | "workflows">>;
}
