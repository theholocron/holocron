import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { skillsUpdateCommand } from "../skills/index.js";

export const updateCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "update",
	describe: "Update installed agent skills to their latest versions",
	builder: (y: Argv<GlobalArgs>) => y.command(skillsUpdateCommand as never).command(groupMenu("update") as never),
	handler: () => {},
};
