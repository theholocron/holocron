import { type MenuEntry } from "@theholocron/kyber/menu";

export const providerEntry: MenuEntry = {
	name: "provider",
	description: "List the providers that have their own setup and doctor (`provider <name> setup|doctor` runs one)",
	positionals: [],
	// The provider names come from the loaded plugins, so a bare run lists them; `--dry-run` previews a setup.
	skipOptions: ["yes"],
	supportsDryRun: false,
};
