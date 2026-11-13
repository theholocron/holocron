import { type MenuEntry } from "@theholocron/kyber/menu";

export const issueCreateEntry: MenuEntry = {
	name: "new issue",
	description: "File an issue in the repo's tracker",
	positionals: [{ key: "title", message: "Title:", type: "input" }],
	options: [{ key: "body", flag: "--body", type: "input", message: "Text:" }],
	skipOptions: ["label", "milestone", "yes"],
	supportsDryRun: true,
};
