import type { Argv, CommandModule } from "yargs";

import {
	applyResolvedConfig,
	type GlobalArgs,
	type InferArgs,
	resolveOrg,
	tokenContext,
} from "../../../cli-support/index.js";
import { loadConfig } from "../../../config/index.js";
import { runProjectClose } from "./project-close.js";

const projectCloseArgs = (yy: Argv<GlobalArgs>) =>
	yy
		.positional("board", {
			type: "string",
			demandOption: true,
			describe: "The board's number or name",
		})
		.option("yes", {
			type: "boolean",
			default: false,
			describe: "Close without asking",
		});

type ProjectCloseArgs = InferArgs<typeof projectCloseArgs>;

export const projectCloseCommand: CommandModule<GlobalArgs, ProjectCloseArgs> = {
	command: "close <board>",
	describe: "Close a board (reversible)",
	builder: projectCloseArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runProjectClose({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			owner: argv.org,
			board: String(argv.board),
			yes: argv.yes,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
