import type { GitHubApp, GitHubAppCredentials, GitHubAppInstallation } from "@theholocron/github-client";
import type { CheckRow, CheckStatus, CheckSummary } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";

/** The access levels of a GitHub App permission, lowest first. */
export type AppPermissionLevel = "read" | "write" | "admin";

/** What an App manifest file declares: the part `doctor github-app` compares with the live App. */
export interface GitHubAppManifest {
	/** `default_permissions`: permission name to level. */
	permissions: Record<string, AppPermissionLevel>;
	/** `default_events`: webhook event names. */
	events: string[];
}

/** The two reads of the live App, so a test can supply them without a network. */
export interface GitHubAppApi {
	/** `GET /app` with the App's own JWT. */
	getApp(creds: GitHubAppCredentials): Promise<GitHubApp>;
	/** `GET /app/installations` with the App's own JWT. */
	listAppInstallations(creds: GitHubAppCredentials): Promise<GitHubAppInstallation[]>;
}

/** What `doctor github-app` needs to run. */
export interface RunDoctorGitHubAppInput {
	/** The loaded config: `githubApps` and the `vault` provider. */
	loaded: LoadedConfig;
	/** The runtime context. */
	context: RuntimeContext;
	/** Defaults to a loader over the config. */
	loader?: PluginLoader;
	/** Reads a manifest file, relative to `context.repoRoot`. Defaults to the real file system. */
	readManifest?: (path: string) => string;
	/** The reads of the live App. Defaults to the GitHub client's. */
	api?: GitHubAppApi;
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

/** How a `doctor github-app` run ended. */
export interface DoctorGitHubAppReport {
	/** `fail` if any row failed, `skip` if nothing could be checked, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why nothing was checked, when that is so. */
	reason?: string;
}
