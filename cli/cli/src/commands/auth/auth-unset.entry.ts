import { type MenuEntry } from "@theholocron/kyber/menu";

import { keyring } from "../../auth/index.js";

export const authUnsetEntry: MenuEntry = {
	name: "remove token",
	description: "Remove a stored bootstrap token",
	positionals: [{ key: "provider", message: "Provider:", type: "select", choices: keyring.list }],
};
