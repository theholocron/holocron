import { describeTasks } from "@theholocron/astromech";
import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const runArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("task", {
			type: "string",
			demandOption: true,
			describe:
				"A task (`typecheck`, `build`, `test:unit`), a suite (`test`, `lint`, `scan`: every leaf the repo lists) or `ci` for the merge-gating suite. `test unit` and `test:unit` are the same call. See the list below.",
		})
		.positional("job", {
			type: "string",
			describe:
				"The qualifier of a suite (`holocron run test unit`) or a sub-job of the task (`holocron run validate adrs`, `holocron run lint commit-msg <file>`). Omit to run every job.",
		})
		.epilogue(describeTasks())
		.positional("passthrough", {
			type: "string",
			array: true,
			describe: "Args forwarded to the tool — put them after `--`.",
		})
		.option("check", {
			type: "boolean",
			default: false,
			describe: "With `format`: report what prettier would change instead of writing it.",
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
