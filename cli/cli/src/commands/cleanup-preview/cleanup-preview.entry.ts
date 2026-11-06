import { type MenuEntry, numeric } from "@theholocron/kyber/menu";

export const cleanupPreviewEntry: MenuEntry = {
	name: "deploy cleanup-preview",
	description: "List and delete Cloudflare Pages preview deployments for a GitHub PR",
	positionals: [{ key: "pr", message: "PR number:", type: "input", validate: numeric }],
	supportsDryRun: true,
};
