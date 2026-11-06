import { type MenuEntry } from "@theholocron/kyber/menu";

export const authSetEntry: MenuEntry = {
	name: "auth set",
	description: "Verify + store a bootstrap token for a provider",
	positionals: [{ key: "provider", message: "Provider name:", type: "input" }],
};
