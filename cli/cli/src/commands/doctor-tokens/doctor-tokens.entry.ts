import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorTokensEntry: MenuEntry = {
	name: "doctor tokens",
	description:
		"Check every token the plugins declare for a layer has the permissions it should, no more, and is not due for rotation (read-only, goes online)",
	positionals: [],
	supportsDryRun: false,
};
