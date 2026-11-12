import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { skillsInstallCommand } from "../skills/index.js";

export const installCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "install",
	describe: "Install agent skills from the @theholocron/skills registry",
	builder: (y: Argv<GlobalArgs>) => y.command(skillsInstallCommand as never).command(groupMenu("install") as never),
	handler: () => {},
};
