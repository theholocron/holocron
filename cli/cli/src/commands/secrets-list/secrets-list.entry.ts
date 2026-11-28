import { type MenuEntry } from "@theholocron/kyber/menu";

export const secretsListEntry: MenuEntry = {
	name: "list secrets",
	description: "List the names of the secrets at each scope (never the values)",
	positionals: [],
	options: [
		{
			key: "scope",
			flag: "--scope",
			type: "select",
			// `environment` is not offered: it needs `--env`, which is asked on its own and adds the environment to the
			// default scopes without it.
			choices: ["repo", "organization"],
			default: "repo",
			message: "List one scope:",
		},
		{
			key: "env",
			flag: "--env",
			type: "input",
			message: "Also list this environment (blank = none):",
		},
	],
	skipOptions: ["json"],
	supportsDryRun: false,
};
