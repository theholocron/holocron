import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import {
	type DeployFunctionResult,
	type DeploymentRecord,
	type DeploymentTrigger,
	PluginLoader,
	type RuntimeContext,
} from "../../plugin/index.js";

export type DeployPrintLine = (line: string) => void;

/** How long {@link waitForDeployment} polls, and the clock it polls with — injectable so tests never sleep. */
export interface DeployWaitOptions {
	/** Give up (and report `fail`) after this long. Default 10 minutes. */
	timeoutMs?: number;
	/** Delay between `getDeployment()` polls. Default 5 s. */
	intervalMs?: number;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
}

export interface RunDeployInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Vendor project id (e.g., Vercel prj_*). Required. */
	projectId: string;
	/** Git branch to deploy. */
	branch: string;
	/** Named target — `undefined` means branch preview. */
	target?: DeploymentTrigger;
	loader?: PluginLoader;
	print?: DeployPrintLine;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	wait?: DeployWaitOptions;
}

export interface DeployReport {
	/** Null in dry-run mode (no actual deployment was triggered). */
	deployment: DeploymentRecord | null;
	status: "ok" | "fail" | "dry-run";
	message?: string;
}

// ── deploy --files (deployFunction) ─────────────────────────────────────

export interface RunDeployFromFilesInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Vendor project id (e.g., Vercel prj_*). Required. */
	projectId: string;
	/** Local directory to deploy — walked recursively. Files are keyed by
	 * their path relative to this directory, POSIX-separated. */
	dir: string;
	/** Named target — `undefined` means preview. */
	target?: DeploymentTrigger;
	loader?: PluginLoader;
	print?: DeployPrintLine;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
	/** Injectable for testing. */
	walkFiles?: (dir: string) => string[];
	readFile?: (path: string) => string;
	wait?: DeployWaitOptions;
}

export interface DeployFilesReport {
	/** Null in dry-run mode or on failure — no actual deployment was created. */
	deployment: DeployFunctionResult | null;
	status: "ok" | "fail" | "dry-run";
	message?: string;
}
