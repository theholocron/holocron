import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorSecretsEntry: MenuEntry = {
	name: "doctor secrets",
	description:
		"Check the secrets the config says must exist against the ones the provider holds (read-only, names only)",
	positionals: [],
	options: [
		{
			key: "env",
			flag: "--env",
			type: "input",
			message: "Environments to check (local, dev, ci, test, prod; comma-separated):",
		},
		{
			key: "verify",
			flag: "--verify",
			type: "confirm",
			default: false,
			message: "Also ask each vendor whether the tokens are still accepted (goes online)?",
		},
		{
			key: "strict",
			flag: "--strict",
			type: "confirm",
			default: false,
			message: "Fail when a place holds a name nothing feeds?",
		},
		{ key: "name", flag: "--name", type: "input", message: "Look up one name:" },
	],
	supportsDryRun: false,
};
