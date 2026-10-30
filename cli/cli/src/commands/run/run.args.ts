import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const runArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("task", {
			type: "string",
			demandOption: true,
			describe:
				"Task name (test, typecheck, lint, build, audit, or `ci` for the merge-gating suite). See `holocron run --help`.",
		})
		.positional("job", {
			type: "string",
			describe:
				"Sub-job within the task (e.g. `holocron run audit performance`, `holocron run lint commit-msg <file>`). Omit to run every job.",
		})
		.positional("passthrough", {
			type: "string",
			array: true,
			describe: "Args forwarded to the tool — put them after `--`.",
		})
		.option("required", {
			type: "boolean",
			default: false,
			describe: "Fail (exit 1) if this repo has no such task, instead of skipping.",
		})
		.option("all", {
			type: "boolean",
			default: false,
			describe: "With `run ci`: run every `ci: true` task, not just the required ones.",
		})
		.option("filter", {
			type: "string",
			describe: "turbo --filter=<pkg> passthrough (monorepo).",
		})
		.option("affected", {
			type: "boolean",
			default: false,
			describe: "Run only the packages changed since --base, and their dependents (turbo --affected).",
		})
		.option("base", {
			type: "string",
			describe: "Git ref --affected compares against. Falls back to TURBO_SCM_BASE.",
		});

export type RunArgs = InferArgs<typeof runArgs>;
