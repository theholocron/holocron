import type { Argv, CommandModule } from "yargs";

import { authUnsetCommand } from "../auth/auth-unset.command.js";
import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { skillsRemoveCommand } from "../skills/skills.command.js";

export const removeCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "remove",
	describe: "Remove a stored token or installed skills",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(authUnsetCommand as never)
			.command(skillsRemoveCommand as never)
			.command(groupMenu("remove") as never),
	handler: () => {},
};
