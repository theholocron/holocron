import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs, groupMenu } from "../../cli-support/index.js";
import { projectCloseCommand } from "./project-close/index.js";
import { projectCreateCommand } from "./project-create/index.js";
import { projectListCommand } from "./project-list/index.js";
import { projectSetupCommand } from "./project-setup/index.js";

export const projectCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "project <subcommand>",
	describe: "Project boards: list, create, close and set them up from templates",
	builder: (y: Argv<GlobalArgs>) =>
		y
			// One `.command(...)` per subcommand; add new ones (move, reconcile, ...) below, before `groupMenu`.
			.command(projectListCommand as never)
			.command(projectCreateCommand as never)
			.command(projectCloseCommand as never)
			.command(projectSetupCommand as never)
			.command(groupMenu("project") as never),
	handler: () => {},
};
