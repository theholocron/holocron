import { type MenuEntry } from "@theholocron/kyber/menu";

export const secretsListEntry: MenuEntry = {
	name: "list secrets",
	description: "List the names of the secrets at each scope (never the values)",
	positionals: [],
	options: [
		{
			key: "scope",
			flag: "--scope",
			type: "input",
			message: "List one scope (repo, env=<name>, org=<name>):",
		},
		{
			key: "env",
			flag: "--env",
			type: "input",
			message: "Also list this environment:",
		},
	],
	skipOptions: ["json"],
	supportsDryRun: false,
};
