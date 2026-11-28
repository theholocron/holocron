import type { Argv, CommandModule } from "yargs";

import { configShowCommand } from "../config-show/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";

export const showCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "show",
	describe: "Show the resolved holocron config",
	builder: (y: Argv<GlobalArgs>) => y.command(configShowCommand as never).command(groupMenu("show") as never),
	handler: () => {},
};
