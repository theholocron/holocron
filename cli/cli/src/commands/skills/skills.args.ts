import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export interface SkillsRemoveArgs extends GlobalArgs {
	names?: string[];
	all?: boolean;
}

export interface SkillsUpdateArgs extends GlobalArgs {
	name?: string;
}

export const skillsRemoveArgs = (y: Argv<GlobalArgs>): Argv<SkillsRemoveArgs> =>
	y
		.positional("names", {
			type: "string",
			array: true,
			describe: "Skill name(s) to remove",
		})
		.option("all", {
			type: "boolean",
			describe: "Remove every installed skill",
		});

export const skillsUpdateArgs = (y: Argv<GlobalArgs>): Argv<SkillsUpdateArgs> =>
	y.positional("name", {
		type: "string",
		describe: "Skill name to update (omit to update all installed skills)",
	});
