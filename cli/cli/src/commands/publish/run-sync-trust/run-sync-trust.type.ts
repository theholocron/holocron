import type { Logger } from "@theholocron/observability/core";

import type { PublishExecResult, PublishPrint, PublishStatus } from "../publish.type.js";

export interface RunSyncTrustInput {
	/** Working directory (the monorepo or package root). Defaults to process.cwd(). */
	cwd?: string;
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
	status: "ok" | "skipped" | "needs-auth" | "fail";
	message?: string;
}

export interface SyncTrustReport {
	status: PublishStatus;
	message?: string;
	packages: readonly SyncTrustPackageResult[];
}

export interface NpmTrustEntry {
	id?: string;
	file?: string;
}
export interface NpmTrustError {
	error?: { code?: string; authUrl?: string };
}
