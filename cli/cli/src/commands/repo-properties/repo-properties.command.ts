import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { repoPropertiesApplyCommand } from "./repo-properties-apply.command.js";

export const repoPropertiesCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "properties",
	describe: "Organization-level custom properties that `doctor repo` checks",
	builder: (y: Argv<GlobalArgs>) =>
		y.command(repoPropertiesApplyCommand as never).command(groupMenu("repo properties") as never),
	handler: () => {},
};
