import { type MenuEntry, numeric } from "@theholocron/kyber/menu";

export const upgradeNodeEntry: MenuEntry = {
	name: "upgrade node",
	description: "Scan the repo and update every Node.js version pin to a new major",
	positionals: [{ key: "to", message: "Target Node.js major version:", type: "input", validate: numeric }],
	supportsDryRun: true,
};
