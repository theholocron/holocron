import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorTokensEntry: MenuEntry = {
	name: "doctor tokens",
	description:
		"Check that each token a configured plugin takes is set and still accepted (read-only; no token is printed)",
	positionals: [],
	supportsDryRun: false,
};
