import { type InferArgs } from "@theholocron/kyber/flags";
import type { Argv, CommandModule } from "yargs";

import { loadConfig } from "../../../config/index.js";
import { applyResolvedConfig } from "../../apply-resolved-config/index.js";
import { type GlobalArgs } from "../../global-args/index.js";
import { resolveOrg } from "../../resolve-org/index.js";
import { tokenContext } from "../../token-context/index.js";
import { runProjectCreate } from "./project-create.js";

const projectCreateArgs = (yy: Argv<GlobalArgs>) =>
	yy
		.positional("template", {
			type: "string",
			describe: "The template to make the board from: a built-in or a file in the templates directory",
		})
		.option("title", {
			type: "string",
			describe: "The board's title (defaults to the template's name)",
		})
		.option("yes", {
			type: "boolean",
			default: false,
			describe: "When an open board has that title, print its address instead of asking",
		});

type ProjectCreateArgs = InferArgs<typeof projectCreateArgs>;

export const projectCreateCommand: CommandModule<GlobalArgs, ProjectCreateArgs> = {
	command: "project [template]",
	describe: "Make a board from a template",
	builder: projectCreateArgs,
	handler: async (argv) => {
		const tokens = tokenContext(argv.token);
		if (!tokens) return;
		const loaded = await loadConfig(argv.cwd);
		applyResolvedConfig(argv, loaded.resolved);
		const report = await runProjectCreate({
			loaded,
			context: { repoRoot: argv.cwd, dryRun: argv.dryRun, ...tokens, org: resolveOrg(argv, loaded.resolved) },
			owner: argv.org,
			template: argv.template,
			title: argv.title,
			yes: argv.yes,
		});
		if (report.status === "fail") process.exitCode = 1;
	},
};
