import type { TasksConfig } from "../../config/schema/index.js";
import type { RunDeps } from "../run/index.js";

export interface GroupOptions {
	/** Print the resolved commands without running anything. */
	dryRun?: boolean;
	/** `turbo --filter=<pkg>` passthrough (monorepo). */
	filter?: string;
	/** `turbo --affected`: only the packages changed since `base`. */
	affected?: boolean;
	/** Git ref `affected` compares against. */
	base?: string;
	/** Environment `affected` reads. */
	env?: Record<string, string | undefined>;
}

export interface GroupJobReport {
	task: string;
	status: "ok" | "fail" | "skip" | "dry-run";
	command?: string;
	message?: string;
}

export interface GroupReport {
	/** `"unknown"` when the namespace matches zero configured tasks. */
	status: "ok" | "fail" | "dry-run" | "unknown";
	jobs: GroupJobReport[];
}

export interface GroupInput extends RunDeps, GroupOptions {
	cwd: string;
	config: TasksConfig;
	/** The bare namespace, e.g. `"sourceQuality"` — matched against `"sourceQuality."`-prefixed task names. */
	namespace: string;
}
