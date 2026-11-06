import type { Argv, CommandModule } from "yargs";

import { githubAppCreateCommand } from "../github-app-create/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";

export const githubAppCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "github-app <subcommand>",
	describe: "Create and manage GitHub Apps",
	builder: (y: Argv<GlobalArgs>) =>
		y.command(githubAppCreateCommand as never).command(groupMenu("github-app") as never),
	handler: () => {},
};
