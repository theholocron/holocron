import type { Argv, CommandModule } from "yargs";

import { authListCommand } from "../auth/auth-list.command.js";
import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { projectListCommand } from "../project/project-list/index.js";
import { secretsListCommand } from "../secrets-list/secrets-list.command.js";
import { skillsListCommand } from "../skills/skills.command.js";

export const listCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "list",
	describe: "List projects, secrets, skills or stored tokens",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(secretsListCommand as never)
			.command(projectListCommand as never)
			.command(authListCommand as never)
			.command(skillsListCommand as never)
			.command(groupMenu("list") as never),
	handler: () => {},
};
