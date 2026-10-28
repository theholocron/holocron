import type { Argv } from "yargs";

import type { GlobalArgs } from "../../cli-support/index.js";

export interface SkillsRemoveArgs extends GlobalArgs {
	names?: string[];
}

export interface SkillsUpdateArgs extends GlobalArgs {
	name?: string;
}

export const skillsRemoveArgs = (y: Argv<GlobalArgs>): Argv<SkillsRemoveArgs> =>
	y.positional("names", {
		type: "string",
		array: true,
		describe: "Skill name(s) to remove (omit to remove all installed skills)",
	});

export const skillsUpdateArgs = (y: Argv<GlobalArgs>): Argv<SkillsUpdateArgs> =>
	y.positional("name", {
		type: "string",
		describe: "Skill name to update (omit to update all installed skills)",
	});
