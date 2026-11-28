import { type MenuEntry } from "@theholocron/kyber/menu";

export const applyIssueTypesEntry: MenuEntry = {
	name: "apply issue-types",
	description: "Make the organization's issue Types match the org area's issueTypes",
	positionals: [],
	options: [
		{
			key: "update",
			flag: "--update",
			type: "confirm",
			default: false,
			message: "Also set the description and colour of a Type that exists and differs?",
		},
	],
	skipOptions: ["yes"],
	supportsDryRun: true,
};
