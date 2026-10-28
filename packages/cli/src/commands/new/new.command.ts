import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs, groupMenu } from "../../cli-support/index.js";
import { pluginCreateCommand } from "../plugin-create/plugin-create.command.js";
import { newRepoCommand } from "./new-repo.command.js";

export const newCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "new",
	describe: "Scaffold a new repo or plugin",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(newRepoCommand as never)
			.command(pluginCreateCommand as never)
			.command(groupMenu("new") as never),
	handler: () => {},
};
