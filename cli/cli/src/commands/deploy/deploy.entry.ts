import { type MenuEntry } from "@theholocron/kyber/menu";

export const deployEntry: MenuEntry = {
	name: "deploy",
	description: "Trigger a deployment via the configured `deployment` capability",
	positionals: [{ key: "branch", message: "Branch to deploy:", type: "input" }],
	options: [
		{
			key: "projectId",
			flag: "--project-id",
			type: "input",
			// Not `demandOption` (its subcommands would inherit that), but the handler exits without it: always asked.
			required: true,
			message: "Deployment project id (e.g. Vercel prj_*):",
		},
		{
			key: "target",
			flag: "--target",
			type: "select",
			choices: ["production", "staging"],
			default: "production",
			message: "Named environment to deploy into (leave the option off for a branch preview):",
		},
	],
	// `--env` deploys an app by name: this entry prompts for a branch and a project id instead.
	skipOptions: ["files", "env", "environment"],
	supportsDryRun: true,
};
