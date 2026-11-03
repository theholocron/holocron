import { createAstromech } from "@theholocron/astromech";
import { loadTasksConfig } from "@theholocron/astromech/config";
import { lintCommitMsgFile } from "@theholocron/astromech/lint";
import type { CommandModule } from "yargs";

import { type GlobalArgs } from "../../cli-support/index.js";
import { buildCliLogger, reportError } from "../../observability/logger/index.js";
import { type RunArgs, runArgs } from "./run.args.js";

export const runCommand: CommandModule<GlobalArgs, RunArgs> = {
	command: "run <task> [job] [passthrough..]",
	describe:
		"Run a task or a suite locally (`test`, `test unit`, `typecheck`, `lint`, `build`, `format`) — figures out turbo / the tool / the package manager. `run ci` runs every merge-gating check; `run lint commit-msg <file>` lints a commit message.",
	builder: runArgs,
	handler: async (argv) => {
		// The specific command key (not just `run`) so `contexts.ts` can scope the
		// commit-msg hook to the global dataset and `run ci` to the repo's (ADR-0012).
		const commandKey =
			argv.task === "ci"
				? "run ci"
				: argv.task === "lint" && argv.job === "commit-msg"
					? "run lint commit-msg"
					: "run";
		const { logger } = buildCliLogger(argv, { command: commandKey });
		// Positional words after the job still name the task (`run test unit storybook`); only what follows `--` is for the tool.
		const args = (argv.passthrough as string[] | undefined) ?? [];
		const passthrough = (argv["--"] as string[] | undefined) ?? [];
		// `run lint commit-msg <file>` is the `.husky/commit-msg` hook: a real
		// commit-message linter, not astromech's filesystem-driven `lint` task.
		if (argv.task === "lint" && argv.job === "commit-msg") {
			const file = args[0] ?? passthrough[0];
			if (!file) {
				reportError("run lint commit-msg: missing <file> (the commit message file git passes as $1).");
				process.exitCode = 1;
				return;
			}
			const result = await lintCommitMsgFile(file, argv.cwd as string);
			if (!result.valid) {
				for (const violation of result.violations) {
					console.error(`✖ ${violation.rule}: ${violation.message}`);
				}
				process.exitCode = 1;
			}
			return;
		}
		// `ci` isn't a manifest task: it's the merge-gating suite, in CI order.
		if (argv.task === "ci") {
			const ciConfig = await loadTasksConfig(argv.cwd as string).catch(() => undefined);
			const report = createAstromech({ cwd: argv.cwd, logger, config: ciConfig }).ci({
				dryRun: argv.dryRun,
				scope: argv.all ? "all" : "required",
				...(argv.filter ? { filter: argv.filter as string } : {}),
				...(argv.affected ? { affected: true } : {}),
				...(argv.base ? { base: argv.base as string } : {}),
			});
			if (report.status === "fail") process.exitCode = 1;
			return;
		}
		// The task manifest drives `lint`'s linter set; other tasks are
		// filesystem-driven and ignore it. Missing / unparseable config → undefined.
		const config = await loadTasksConfig(argv.cwd as string).catch(() => undefined);
		const astromech = createAstromech({ cwd: argv.cwd, logger, config });
		const report = astromech.run(argv.task as string, {
			...(argv.job !== undefined ? { job: argv.job as string } : {}),
			...(args.length > 0 ? { args } : {}),
			passthrough,
			...(argv.check ? { check: true } : {}),
			dryRun: argv.dryRun,
			required: argv.required,
			...(argv.filter ? { filter: argv.filter as string } : {}),
			...(argv.affected ? { affected: true } : {}),
			...(argv.base ? { base: argv.base as string } : {}),
		});
		if (report.status === "fail" || report.status === "unknown") process.exitCode = 1;
	},
};
