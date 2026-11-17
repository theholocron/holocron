import { type MenuEntry, numeric } from "@theholocron/kyber/menu";

export const cleanupPreviewEntry: MenuEntry = {
	name: "deploy cleanup-preview",
	description: "List and delete Cloudflare Pages preview deployments for a GitHub PR",
	positionals: [{ key: "pr", message: "PR number:", type: "input", validate: numeric }],
	options: [
		{
			key: "project",
			flag: "--project",
			type: "input",
			message: "Cloudflare Pages project name (blank = the configured one):",
		},
	],
	skipOptions: ["project-id", "target", "files", "repo"],
	supportsDryRun: true,
};
