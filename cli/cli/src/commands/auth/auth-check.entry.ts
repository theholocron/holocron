import { type MenuEntry } from "@theholocron/kyber/menu";

import { keyring } from "../../auth/index.js";

export const authCheckEntry: MenuEntry = {
	name: "auth check",
	description: "Re-verify a stored bootstrap token",
	positionals: [{ key: "provider", message: "Provider:", type: "select", choices: keyring.list }],
};
