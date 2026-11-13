import { type MenuEntry } from "@theholocron/kyber/menu";

export const secretsSyncEntry: MenuEntry = {
	name: "sync secrets",
	description: "Read a vault environment + fan KEY=VALUEs out to secrets + deployment env vars",
	positionals: [],
	options: [
		{
			key: "env",
			flag: "--env",
			type: "input",
			required: true,
			message: "Vault environment (a layer such as ci or prod, or an Environment name):",
		},
	],
	supportsDryRun: true,
};
