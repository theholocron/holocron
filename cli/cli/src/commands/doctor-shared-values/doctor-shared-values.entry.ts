import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorSharedValuesEntry: MenuEntry = {
	name: "doctor shared-values",
	description: "Find secrets that hold the same value in two layers: local, dev, ci and prod (read-only, names only)",
	positionals: [],
	options: [
		{
			key: "strict",
			flag: "--strict",
			type: "confirm",
			default: false,
			message: "Fail when a secret is shared between two layers?",
		},
	],
	supportsDryRun: false,
};
