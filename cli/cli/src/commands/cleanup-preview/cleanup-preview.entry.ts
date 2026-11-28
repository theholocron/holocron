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
			// `demandOption` in yargs: the command exits without it, so it is always asked.
			required: true,
			message:
				"Deployment project (a Cloudflare Pages project name such as theholocron-preview, or a Vercel project):",
		},
	],
	skipOptions: ["project-id", "target", "files", "repo", "yes"],
	supportsDryRun: true,
};
