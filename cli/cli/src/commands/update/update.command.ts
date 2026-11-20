import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { issueUpdateCommand } from "../issue-update/index.js";
import { skillsUpdateCommand } from "../skills/index.js";

export const updateCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "update",
	describe: "Update installed agent skills, or an issue in the tracker",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(skillsUpdateCommand as never)
			.command(issueUpdateCommand as never)
			.command(groupMenu("update") as never),
	handler: () => {},
};
