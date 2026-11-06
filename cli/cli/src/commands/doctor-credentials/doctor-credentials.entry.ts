import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorCredentialsEntry: MenuEntry = {
	name: "doctor credentials",
	description: "Check that the credentials environment exists and holds the tokens the plugins take (read-only)",
	positionals: [],
	supportsDryRun: false,
};
