import { type InferArgs } from "@theholocron/kyber/flags";
import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../../config/index.js";
import { applyResolvedConfig } from "../../apply-resolved-config/index.js";
import { type GlobalArgs } from "../../global-args/index.js";
import { resolveOrg } from "../../resolve-org/index.js";
import { tokenContext } from "../../token-context/index.js";
import { runProjectMove } from "./move.js";

const projectMoveArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("from", {
			type: "string",
			demandOption: true,
			describe: "The board the open items leave (by name)",
		})
		.positional("to", { type: "string", demandOption: true, describe: "The open board they go to (by name)" })
		.option("template", {
			type: "string",
			describe:
				"The template that reads the boards' statuses (default: the one the target board is declared with)",
		})
		.option("yes", { type: "boolean", describe: "Move without asking" });

type ProjectMoveArgs = InferArgs<typeof projectMoveArgs>;

export const projectMoveCommand: CommandModule<GlobalArgs, ProjectMoveArgs> = {
	command: "move <from> <to>",
	describe: "Move the open items of one board to another, with their status and priority; closed ones stay behind",
	builder: projectMoveArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runProjectMove({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			from: argv.from,
			to: argv.to,
			...(argv.template ? { template: argv.template } : {}),
			...(argv.yes ? { yes: true } : {}),
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
