import type { TasksConfig } from "../../config/schema/index.js";
import type { RunDeps } from "../run/index.js";

/** Options for running a namespace of tasks: a dry run and turbo scoping. */
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

/** The result of one task in a namespace run. */
export interface GroupJobReport {
	/** Registry task name, e.g. `"sourceQuality.formatting"`. */
	task: string;
	/** `ok`, `fail`, `skip` (nothing to run for this repo) or `dry-run` (planned, not run). */
	status: "ok" | "fail" | "skip" | "dry-run";
	/** The resolved command, when one was run or planned. */
	command?: string;
	/** Why the job failed or was skipped. */
	message?: string;
}

/** The result of running every task in a namespace. */
export interface GroupReport {
	/** `"unknown"` when the namespace matches zero configured tasks. */
	status: "ok" | "fail" | "dry-run" | "unknown";
	/** One entry per matching task. */
	jobs: GroupJobReport[];
}

export interface GroupInput extends RunDeps, GroupOptions {
	cwd: string;
	config: TasksConfig;
	/** The bare namespace, e.g. `"sourceQuality"` — matched against `"sourceQuality."`-prefixed task names. */
	namespace: string;
}
