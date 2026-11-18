import { type InferArgs } from "@theholocron/kyber/flags";
import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../../config/index.js";
import { applyResolvedConfig } from "../../apply-resolved-config/index.js";
import { type GlobalArgs } from "../../global-args/index.js";
import { resolveOrg } from "../../resolve-org/index.js";
import { tokenContext } from "../../token-context/index.js";
import { runProjectStatus } from "./project-status.js";

const projectStatusArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("issue", {
			type: "string",
			demandOption: true,
			describe: "The issue: #1234, 1234, owner/repo#1234, or the tracker's own key",
		})
		.positional("status", {
			type: "string",
			demandOption: true,
			describe: "A status of the board's template, such as 'In Progress'",
		})
		.option("board", {
			type: "string",
			describe: "The declared board's name (default: the first one declared)",
		});

type ProjectStatusArgs = InferArgs<typeof projectStatusArgs>;

export const projectStatusCommand: CommandModule<GlobalArgs, ProjectStatusArgs> = {
	command: "status <issue> <status>",
	describe: "Set the status of an issue on the project board, by the issue's key",
	builder: projectStatusArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runProjectStatus({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			owner: argv.org,
			issue: String(argv.issue),
			status: String(argv.status),
			...(argv.board ? { board: argv.board } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
