import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorCiEntry: MenuEntry = {
	name: "doctor ci",
	description:
		"Check the repo against the flat task vocabulary: aliases, caller names, the ci aggregate, home (read-only)",
	positionals: [],
	options: [
		{
			key: "shadow",
			flag: "--shadow",
			type: "confirm",
			message: "Also compare Sentinel's shadow aggregate with the Actions one?",
		},
	],
	skipOptions: ["all", "repo", "limit"],
	supportsDryRun: false,
};
