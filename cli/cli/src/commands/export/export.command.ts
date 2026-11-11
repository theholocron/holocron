import type { Argv, CommandModule } from "yargs";

import { authExportCommand } from "../auth-export/index.js";
import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";

export const exportCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "export",
	describe: "Export the stored tokens to move them into a credentials environment",
	builder: (y: Argv<GlobalArgs>) => y.command(authExportCommand as never).command(groupMenu("export") as never),
	handler: () => {},
};
