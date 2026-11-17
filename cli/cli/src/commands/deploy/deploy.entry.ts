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
			message: "Deployment project id (blank = the configured one):",
		},
		{
			key: "target",
			flag: "--target",
			type: "input",
			message: "Named environment to deploy into (blank = a branch preview):",
		},
	],
	skipOptions: ["files"],
	supportsDryRun: true,
};
