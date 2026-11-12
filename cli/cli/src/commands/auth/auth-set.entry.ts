import { type MenuEntry } from "@theholocron/kyber/menu";

export const authSetEntry: MenuEntry = {
	name: "new token",
	description: "Verify + store a bootstrap token for a provider",
	positionals: [{ key: "provider", message: "Provider name:", type: "input" }],
};
