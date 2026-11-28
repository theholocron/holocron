import { type MenuEntry } from "@theholocron/kyber/menu";

import { ISSUE_FIELD_MENU_OPTIONS } from "../issue-fields/add-issue-field-options/index.js";

export const newWorkEntry: MenuEntry = {
	name: "new work",
	description: "File an issue with every field and, with --spec, write its spec stub",
	positionals: [{ key: "title", message: "Title:", type: "input" }],
	options: [
		{ key: "body", flag: "--body", type: "input", message: "Text:" },
		{ key: "bodyFile", flag: "--body-file", type: "input", message: "File with the text (- for stdin):" },
		{ key: "label", flag: "--label", type: "input", message: "Label:" },
		{ key: "assignee", flag: "--assignee", type: "input", message: "Assignee (login; default: git config):" },
		{ key: "milestone", flag: "--milestone", type: "input", message: "Milestone (number or title):" },
		{ key: "spec", flag: "--spec", type: "confirm", message: "Write a spec stub in .notes/ too?" },
		...ISSUE_FIELD_MENU_OPTIONS,
	],
	skipOptions: ["yes"],
	supportsDryRun: true,
};
