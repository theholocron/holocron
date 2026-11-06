import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorCiEntry: MenuEntry = {
	name: "doctor ci",
	description:
		"Check the repo against the flat task vocabulary: aliases, caller names, the ci aggregate, home (read-only)",
	positionals: [],
	supportsDryRun: false,
};
