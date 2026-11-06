import { type MenuEntry } from "@theholocron/kyber/menu";

export const secretsListEntry: MenuEntry = {
	name: "secrets list",
	description: "List the names of the secrets at each scope (never the values)",
	positionals: [],
	supportsDryRun: false,
};
