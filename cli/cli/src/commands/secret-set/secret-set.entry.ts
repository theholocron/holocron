import { type MenuEntry } from "@theholocron/kyber/menu";

export const secretSetEntry: MenuEntry = {
	name: "new secret",
	description: "Set a single secret via the configured `secrets` capability",
	positionals: [{ key: "name", message: "Secret name:", type: "input" }],
	supportsDryRun: true,
};
