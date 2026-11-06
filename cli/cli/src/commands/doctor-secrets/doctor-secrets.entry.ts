import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorSecretsEntry: MenuEntry = {
	name: "doctor secrets",
	description:
		"Check the secrets the config says must exist against the ones the provider holds (read-only, names only)",
	positionals: [],
	supportsDryRun: false,
};
