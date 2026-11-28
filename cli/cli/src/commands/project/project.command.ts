import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { projectStatusCommand } from "./project-status/index.js";

export const projectCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "project",
	describe: "Work with the items of a project board",
	builder: (y: Argv<GlobalArgs>) => y.command(projectStatusCommand as never).command(groupMenu("project") as never),
	handler: () => {},
};
