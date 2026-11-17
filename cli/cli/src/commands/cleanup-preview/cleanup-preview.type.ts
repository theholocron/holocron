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
	/** The deployment project: a Cloudflare Pages project name (e.g. "theholocron-preview") or a Vercel project. */
	project: string;
	/**
	 * Delete every deployment found, with no checklist (CI). A pull request that is still open is refused: deleting its
	 * previews would break the live preview link, and nobody is there to confirm it.
	 */
	yes?: boolean;
	loader?: PluginLoader;
	print?: (line: string) => void;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface CleanupPreviewReport {
	pr: PullRequest;
	/** Branch alias the previews are found by (e.g. "holocron-pr-42"). */
	branch: string;
	found: number;
	deleted: number;
	status: "ok" | "none" | "aborted" | "fail";
	message?: string;
}
