import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { openRequestsCommand } from "../open-requests/index.js";

export const openCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "open",
	describe: "Open a tool with what it needs filled in from the vault",
	builder: (y: Argv<GlobalArgs>) => y.command(openRequestsCommand as never).command(groupMenu("open") as never),
	handler: () => {},
};
