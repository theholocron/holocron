import { type MenuEntry } from "@theholocron/kyber/menu";

export const secretsSyncEntry: MenuEntry = {
	name: "sync secrets",
	description: "Read a vault environment + fan KEY=VALUEs out to secrets + deployment env vars",
	positionals: [{ key: "environmentId", message: "Vault environment id:", type: "input" }],
	supportsDryRun: true,
};
