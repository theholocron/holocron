import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { specsSyncCommand } from "../specs-sync/specs-sync.command.js";

export const specsCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "specs",
	describe: "Keep the repo's ADRs and specs in step with their discussion",
	builder: (y: Argv<GlobalArgs>) => y.command(specsSyncCommand as never).command(groupMenu("specs") as never),
	handler: () => {},
};
