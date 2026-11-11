import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../config/index.js";
import { applyResolvedConfig } from "../apply-resolved-config/index.js";
import type { GlobalArgs } from "../global-args/index.js";
import { resolveOrg } from "../resolve-org/index.js";
import { tokenContext } from "../token-context/index.js";
import { runIdeasPromote } from "./run-ideas-promote/index.js";

type Args = GlobalArgs & { issue: string; name?: string; yes?: boolean };

export const ideasPromoteCommand: CommandModule<GlobalArgs, Args> = {
	command: "spec <issue>",
	describe: "Write a draft spec in .notes/ from an issue that an idea was filed as",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.positional("issue", {
				type: "string",
				demandOption: true,
				describe: "The issue: #1234, 1234 or a Linear key",
			})
			.option("name", {
				type: "string",
				describe: "The whole spec name, without .spec.md (default: tech- and the title in kebab-case)",
			})
			.option("yes", {
				type: "boolean",
				describe: "Write without asking (required without a terminal)",
			}) as never,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runIdeasPromote({
			issue: String(argv.issue),
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			...(argv.name ? { name: argv.name } : {}),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
