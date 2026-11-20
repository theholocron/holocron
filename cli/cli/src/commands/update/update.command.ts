import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { issueUpdateCommand } from "../issue-update/index.js";
import { skillsUpdateCommand } from "../skills/index.js";
import { updateWorkCommand } from "../update-work/index.js";

export const updateCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "update",
	describe: "Update installed agent skills, an issue in the tracker, or a piece of work",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(skillsUpdateCommand as never)
			.command(issueUpdateCommand as never)
			.command(updateWorkCommand as never)
			.command(groupMenu("update") as never),
	handler: () => {},
};
