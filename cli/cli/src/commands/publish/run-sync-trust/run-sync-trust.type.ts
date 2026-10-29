import type { Logger } from "@theholocron/observability/core";

import type { PublishExecResult, PublishPrint, PublishStatus } from "../publish.type.js";

export interface RunSyncTrustInput {
	/** Working directory (the monorepo or package root). Defaults to process.cwd(). */
	cwd?: string;
	/**
	 * Only this version group's packages: a folder of the repo (`clients`,
	 * `observability`). Omitted, every public package in the workspace.
	 */
	group?: string;
	/**
	 * Everything except these version groups, which release on their own. Used by the
	 * repo-wide release so it does not take in a group released separately.
	 */
	excludeGroups?: readonly string[];
	/** The workflow filename npm's Trusted Publisher config currently points at. */
	oldFile: string;
	/** The workflow filename to migrate every package's Trusted Publisher config to. */
	newFile: string;
	/** `owner/repo` for the GitHub Trusted Publisher config. Defaults to `theholocron/holocron`. */
	repo?: string;
	/** Skip the actual npm calls; print what would happen. */
	dryRun?: boolean;
	print?: PublishPrint;
	logger?: Logger;
	/** Injectable command runner — same shape as `RunPublishInput['exec']`. */
	exec?: (cmd: string, args: string[], opts: { cwd: string }) => Promise<PublishExecResult>;
	/** Override the list of package names. Auto-discovered when omitted. */
	packages?: readonly string[];
}

export interface SyncTrustPackageResult {
	name: string;
	status: "ok" | "skipped" | "needs-auth" | "fail" | "would-skip" | "would-sync";
	message?: string;
}

export interface SyncTrustReport {
	status: PublishStatus;
	message?: string;
	packages: readonly SyncTrustPackageResult[];
}

/** What `npm trust list <pkg> --json` prints for a package with a GitHub trust binding. */
export interface NpmTrustEntry {
	id?: string;
	type?: string;
	file?: string;
	/** `owner/repo` the package is bound to. */
	repository?: string;
	permissions?: readonly string[];
}
export interface NpmTrustError {
	error?: { code?: string; authUrl?: string };
}
