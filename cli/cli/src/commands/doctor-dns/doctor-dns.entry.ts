import { type MenuEntry } from "@theholocron/kyber/menu";

export const doctorDnsEntry: MenuEntry = {
	name: "doctor dns",
	description:
		"Check that the DNS records the config makes setup write exist and point where they should (read-only)",
	positionals: [],
	supportsDryRun: false,
};
