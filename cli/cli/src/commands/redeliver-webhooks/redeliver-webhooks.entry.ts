import { type MenuEntry } from "@theholocron/kyber/menu";

export const redeliverWebhooksEntry: MenuEntry = {
	name: "redeliver webhooks",
	description:
		"Ask GitHub to deliver again the webhooks each registered App's endpoint did not accept (the recovery step after a Sentinel outage)",
	positionals: [],
	options: [{ key: "since", flag: "--since", type: "input", message: "How far back (30m, 12h, 7d; default 1d):" }],
	skipOptions: ["app", "yes"],
	supportsDryRun: true,
};
