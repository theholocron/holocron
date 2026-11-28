import type { TasksConfig } from "../../config/schema/index.js";
import type { RunDeps } from "../run/index.js";

/** Options for `Astromech.ci`: the scope, turbo filtering and whether to only print the plan. */
export interface CiOptions {
	/** Print the plan without running anything. */
	dryRun?: boolean;
	/** `turbo --filter=<pkg>` passthrough (monorepo). */
	filter?: string;
	/** `turbo --affected`: only the packages changed since `base`. */
	affected?: boolean;
	/** Git ref `affected` compares against. */
	base?: string;
	/** Environment `affected` reads. */
	env?: Record<string, string | undefined>;
	/** `"required"` (default) or `"all"` (every `ci: true` task). */
	scope?: "required" | "all";
}

/** The result of one task in a CI pre-flight run. */
export interface CiJobReport {
	/** Registry task name, e.g. `"test"`. */
	task: string;
	/** The branch-protection check context, or `null` for a non-gating task. */
	checkContext: string | null;
	/** `ok`, `fail`, `skip` (nothing to run for this repo) or `dry-run` (planned, not run). */
	status: "ok" | "fail" | "skip" | "dry-run";
	/** The resolved command, when one was run or planned. */
	command?: string;
	/** Why the job failed or was skipped. */
	message?: string;
}

/** The result of a CI pre-flight run. */
export interface CiReport {
	/** `fail` if any job failed, else `ok`. */
	status: "ok" | "fail";
	/** One entry per task. */
	jobs: CiJobReport[];
}

export interface CiInput extends RunDeps, CiOptions {
	cwd: string;
	config: TasksConfig;
}
