import { type MenuEntry } from "@theholocron/kyber/menu";

export const monitoringCheckEntry: MenuEntry = {
	name: "check monitor",
	description: "Run every configured `monitoring` check against a given URL instead of its own configured url",
	positionals: [{ key: "url", message: "URL to test against:", type: "input" }],
	options: [
		{
			key: "vercelProject",
			flag: "--vercel-project",
			type: "input",
			message: "Vercel project the URL must resolve to (blank = any):",
		},
	],
	supportsDryRun: false,
};
