import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import { PluginLoader, type PullRequest, type RuntimeContext } from "../../plugin/index.js";

export interface RunCleanupPreviewInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** PR number to look up on the source provider. */
	prNumber: number;
	/**
	 * "owner/name" override — when provided, the PR is looked up in this repo
	 * instead of the one the source plugin is scoped to.
	 */
	repo?: string;
	/** Cloudflare Pages project name (e.g. "theholocron-preview"). */
	project: string;
	loader?: PluginLoader;
	print?: (line: string) => void;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface CleanupPreviewReport {
	pr: PullRequest;
	/** Branch alias used to query Cloudflare (e.g. "holocron-pr-42"). */
	branch: string;
	found: number;
	deleted: number;
	status: "ok" | "none" | "aborted" | "fail";
	message?: string;
}
