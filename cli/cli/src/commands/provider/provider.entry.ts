import { type MenuEntry } from "@theholocron/kyber/menu";

export const providerEntry: MenuEntry = {
	name: "provider",
	description: "List the providers that have their own setup and doctor (`provider <name> setup|doctor` runs one)",
	positionals: [],
	// The provider names come from the loaded plugins, so a bare run lists them; `--dry-run` previews a setup.
	// `--with` names option files and pairs for a provider the config does not name: typed on the command line.
	skipOptions: ["yes", "with"],
	supportsDryRun: false,
};
