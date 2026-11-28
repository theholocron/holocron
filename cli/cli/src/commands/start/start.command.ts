import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { startWorkCommand } from "../start-work/index.js";

export const startCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "start",
	describe: "Start a piece of work: its branch, worktree, first commit and draft pull request",
	builder: (y: Argv<GlobalArgs>) => y.command(startWorkCommand as never).command(groupMenu("start") as never),
	handler: () => {},
};
