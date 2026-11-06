import { type MenuEntry } from "@theholocron/kyber/menu";

export const secretSetEntry: MenuEntry = {
	name: "secrets set",
	description: "Set a single secret via the configured `secrets` capability",
	positionals: [{ key: "name", message: "Secret name:", type: "input" }],
	supportsDryRun: true,
};
