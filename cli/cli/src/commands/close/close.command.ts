import type { Argv, CommandModule } from "yargs";

import { closeIncidentCommand } from "../close-incident/index.js";
import { closeWorkCommand } from "../close-work/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { projectCloseCommand } from "../project/project-close/index.js";

export const closeCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "close",
	describe: "Close a project board, close out a piece of work, or resolve a status page incident",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(projectCloseCommand as never)
			.command(closeWorkCommand as never)
			.command(closeIncidentCommand as never)
			.command(groupMenu("close") as never),
	handler: () => {},
};
