import type { Argv, CommandModule } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { ideasSyncCommand } from "../ideas-sync/index.js";

export const ideasCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "ideas",
	describe: "Work with the idea notes that sit in front of the issue tracker",
	builder: (y: Argv<GlobalArgs>) => y.command(ideasSyncCommand as never).command(groupMenu("ideas") as never),
	handler: () => {},
};
