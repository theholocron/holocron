import type { TasksConfig } from "../../config/schema/index.js";
import type { RunDeps } from "../run/index.js";

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

export interface CiJobReport {
	task: string;
	/** The branch-protection check context, or `null` for a non-gating task. */
	checkContext: string | null;
	status: "ok" | "fail" | "skip" | "dry-run";
	command?: string;
	message?: string;
}

export interface CiReport {
	status: "ok" | "fail";
	jobs: CiJobReport[];
}

export interface CiInput extends RunDeps, CiOptions {
	cwd: string;
	config: TasksConfig;
}
