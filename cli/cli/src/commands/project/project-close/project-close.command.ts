import { type InferArgs } from "@theholocron/kyber/flags";
import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../../config/index.js";
import { applyResolvedConfig } from "../../apply-resolved-config/index.js";
import { type GlobalArgs } from "../../global-args/index.js";
import { resolveOrg } from "../../resolve-org/index.js";
import { tokenContext } from "../../token-context/index.js";
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
	command: "project <board>",
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
