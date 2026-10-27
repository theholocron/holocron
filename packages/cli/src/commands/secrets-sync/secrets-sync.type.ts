import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import { type DeploymentTarget, PluginLoader, type RuntimeContext, type SecretScope } from "../../plugin/index.js";

export type SyncPrintLine = (line: string) => void;

export type SyncRowStatus = "ok" | "fail" | "dry-run" | "skip";

export interface SyncRow {
	destination: string;
	/** e.g., `target=production` for deployment, `scope=repo` for secrets. */
	scope: string;
	key: string;
	status: SyncRowStatus;
	message?: string;
}

export interface SyncReport {
	rows: SyncRow[];
	summary: { ok: number; fail: number; skip: number; dryRun: number };
}

export interface RunSecretsSyncInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Vault environment id to read. */
	environmentId: string;
	/** Deployment targets to sync to. Defaults to ['production', 'preview']. */
	targets?: DeploymentTarget[];
	/** Vercel project id (or equivalent). Required if `deployment` is loaded. */
	projectId?: string;
	/** A deployed Worker to set every vault key on as a secret (needs a `workers` provider that can). */
	workerScript?: string;
	/**
	 * Allowlist restricting which vault keys reach `secrets`. Omit to push
	 * every key (the default). See this module's own docstring.
	 */
	githubSecretKeys?: string[];
	/** Scope applied to every `githubSecretKeys` entry. Omit for `{ kind: "repo" }` (the default). */
	githubSecretScope?: SecretScope;
	loader?: PluginLoader;
	print?: SyncPrintLine;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
}
