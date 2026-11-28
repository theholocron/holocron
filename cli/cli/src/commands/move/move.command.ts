import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { projectMoveCommand } from "../project/move/index.js";

export const moveCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "move",
	describe: "Move the open items of one project board to another",
	builder: (y: Argv<GlobalArgs>) => y.command(projectMoveCommand as never).command(groupMenu("move") as never),
	handler: () => {},
};
