import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runIssueCreate } from "./run-issue-create/index.js";

type Args = GlobalArgs & { title: string; body?: string; label?: string[]; milestone?: string; yes?: boolean };

export const issueCreateCommand: CommandModule<GlobalArgs, Args> = {
	command: "issue <title>",
	describe: "File an issue in the repo's tracker",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.positional("title", { type: "string", demandOption: true, describe: "The issue's title" })
			.option("body", { type: "string", describe: "The issue's text" })
			.option("label", { type: "string", array: true, describe: "A label to put on it (repeatable)" })
			.option("milestone", { type: "string", describe: "The milestone: its number or its exact title" })
			.option("yes", { type: "boolean", describe: "File without asking (required without a terminal)" }) as never,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runIssueCreate({
			title: String(argv.title),
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.body ? { body: argv.body } : {}),
			...(argv.label ? { labels: argv.label.map(String) } : {}),
			...(argv.milestone ? { milestone: String(argv.milestone) } : {}),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
