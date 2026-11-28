import type { RunDeps } from "../run/index.js";

/** Options for running a suite: a dry run and turbo scoping. */
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

/** One task of a group run. */
export interface GroupMember {
	/** Flat id, e.g. `"lint:code"`. */
	task: string;
	/** Args the task is run with (`--check` for `format` when an old name asked for it). */
	passthrough?: string[];
}

/** The result of one task in a group run. */
export interface GroupJobReport {
	/** Flat id, e.g. `"lint:code"`. */
	task: string;
	/** `ok`, `fail`, `skip` (nothing to run for this repo) or `dry-run` (planned, not run). */
	status: "ok" | "fail" | "skip" | "dry-run";
	/** The resolved command, when one was run or planned. */
	command?: string;
	/** Why the job failed or was skipped. */
	message?: string;
}

/** The result of running every task in a group. */
export interface GroupReport {
	/** `"unknown"` when the group has no task to run. */
	status: "ok" | "fail" | "dry-run" | "unknown";
	/** One entry per task. */
	jobs: GroupJobReport[];
}

export interface GroupInput extends RunDeps, GroupOptions {
	cwd: string;
	/** What was asked for, as typed: `"test"`, `"sourceQuality"`. */
	label: string;
	/** The tasks to run, in order. */
	members: GroupMember[];
	/** Tasks reported as skipped without running, each with its reason (the repo-wide leaves, from a package directory). */
	skipped?: Array<{ task: string; message: string }>;
}
