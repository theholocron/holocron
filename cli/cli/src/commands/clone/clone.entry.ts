import { type MenuEntry } from "@theholocron/kyber/menu";

export const cloneEntry: MenuEntry = {
	name: "clone",
	description: "Clone a single repo (org/repo) or every repo in an org (org)",
	positionals: [
		{
			key: "target",
			message: "org/repo to clone (or a bare org to clone every repo in it):",
			type: "input",
			validate: (v) => v.trim().length > 0 || "org/repo or org is required",
		},
	],
	options: [
		{
			key: "dir",
			flag: "--dir",
			type: "input",
			message: "Parent directory to clone into (blank = ~/Code/<org>):",
		},
	],
	supportsDryRun: true,
};
