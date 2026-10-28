import { type CommandEntry } from "../../interactive-menu/command-registry/command-registry.type.js";
import { numeric } from "../../interactive-menu/command-registry/validators.js";

export const cleanupPreviewEntry: CommandEntry = {
	name: "deploy cleanup-preview",
	description: "List and delete Cloudflare Pages preview deployments for a GitHub PR",
	positionals: [{ key: "pr", message: "PR number:", type: "input", validate: numeric }],
	supportsDryRun: true,
};
