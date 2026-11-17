import { type MenuEntry } from "@theholocron/kyber/menu";

export const secretSetEntry: MenuEntry = {
	name: "new secret",
	description: "Set a single secret via the configured `secrets` capability",
	positionals: [{ key: "name", message: "Secret name:", type: "input" }],
	options: [
		{
			key: "scope",
			flag: "--scope",
			type: "input",
			message: "Scope: repo (default), env=<name> or org=<name>:",
		},
	],
	skipOptions: ["from-stdin", "from-env"],
	supportsDryRun: true,
};
