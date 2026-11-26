import { type MenuEntry } from "@theholocron/kyber/menu";

export const secretSetEntry: MenuEntry = {
	name: "new secret",
	description: "Set a single secret via the configured `secrets` capability, or hand a new one to a vault by file",
	positionals: [{ key: "name", message: "Secret name:", type: "input" }],
	options: [
		{
			key: "scope",
			flag: "--scope",
			type: "input",
			message: "Scope: repo (default), env=<name> or org=<name>:",
		},
		{
			key: "generate",
			flag: "--generate",
			type: "confirm",
			default: false,
			message: "Make the value (only for a secret the CLI generates, such as CRON_SECRET)?",
		},
		{
			key: "target",
			flag: "--target",
			type: "input",
			message: "Target: github (default) or file (the private import file for a vault):",
		},
		{
			key: "env",
			flag: "--env",
			type: "input",
			message: "With --target file: the vault Environment to import into (a layer such as prod, or a name):",
		},
	],
	skipOptions: ["from-stdin", "from-env", "yes"],
	supportsDryRun: true,
};
