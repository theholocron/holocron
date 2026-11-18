import { type MenuEntry } from "@theholocron/kyber/menu";

export const issueCreateEntry: MenuEntry = {
	name: "new issue",
	description: "File an issue in the repo's tracker",
	positionals: [{ key: "title", message: "Title:", type: "input" }],
	options: [
		{ key: "body", flag: "--body", type: "input", message: "Text:" },
		{ key: "bodyFile", flag: "--body-file", type: "input", message: "File with the text (- for stdin):" },
		{ key: "label", flag: "--label", type: "input", message: "Label:" },
		{ key: "assignee", flag: "--assignee", type: "input", message: "Assignee (login, or me):" },
		{ key: "milestone", flag: "--milestone", type: "input", message: "Milestone (number or title):" },
	],
	skipOptions: ["yes"],
	supportsDryRun: true,
};
