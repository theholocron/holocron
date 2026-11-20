import type { Argv, CommandModule } from "yargs";

import { closeWorkCommand } from "../close-work/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { projectCloseCommand } from "../project/project-close/index.js";

export const closeCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "close",
	describe: "Close a project board, or close out a piece of work",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(projectCloseCommand as never)
			.command(closeWorkCommand as never)
			.command(groupMenu("close") as never),
	handler: () => {},
};
