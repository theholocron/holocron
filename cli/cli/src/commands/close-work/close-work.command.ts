import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runCloseWork } from "./run-close-work/index.js";

type Args = GlobalArgs & {
	issue: string;
	wait?: boolean;
	timeout?: number;
	abandon?: boolean;
	keepWorktree?: boolean;
	pr?: number;
	yes?: boolean;
};

export const closeWorkCommand: CommandModule<GlobalArgs, Args> = {
	command: "work <issue>",
	describe:
		"Close out a piece of work: mark its pull request ready when the checks are green, clean up after the merge, or --abandon it",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.positional("issue", {
				type: "string",
				demandOption: true,
				describe: "The issue: #1234, 1234, owner/repo#1234 or the tracker's own key",
			})
			.option("wait", {
				type: "boolean",
				describe: "Poll the `ci / Required checks` aggregate until it is green or red, or --timeout passes",
			})
			.option("timeout", {
				type: "number",
				describe: "With --wait: how many minutes to poll (default 30)",
			})
			.option("abandon", {
				type: "boolean",
				describe:
					"Give the work up: close the pull request, withdraw the spec's post, remove the worktree and branch, and ask about closing the issue",
			})
			.option("keep-worktree", {
				type: "boolean",
				describe: "Leave the worktree, and so its local branch, where they are",
			})
			.option("pr", {
				type: "number",
				describe: "The pull request's number, when its branch is not <type>/<issue>-<slug>",
			})
			.option("yes", { type: "boolean", describe: "Do it without asking (required without a terminal)" }),
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runCloseWork({
			issue: String(argv.issue),
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.wait ? { wait: true } : {}),
			...(argv.timeout !== undefined ? { timeoutMinutes: Number(argv.timeout) } : {}),
			...(argv.abandon ? { abandon: true } : {}),
			...(argv.keepWorktree ? { keepWorktree: true } : {}),
			...(argv.pr !== undefined ? { pullRequest: Number(argv.pr) } : {}),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
