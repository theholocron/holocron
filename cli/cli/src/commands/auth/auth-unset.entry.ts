import { type MenuEntry } from "@theholocron/kyber/menu";

import { keyring } from "../../auth.js";

export const authUnsetEntry: MenuEntry = {
	name: "auth unset",
	description: "Remove a stored bootstrap token",
	positionals: [{ key: "provider", message: "Provider:", type: "select", choices: keyring.list }],
};
