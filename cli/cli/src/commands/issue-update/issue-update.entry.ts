import { type MenuEntry } from "@theholocron/kyber/menu";

import { ISSUE_FIELD_MENU_OPTIONS } from "../issue-fields/add-issue-field-options/index.js";

export const issueUpdateEntry: MenuEntry = {
	name: "update issue",
	description: "Change an issue in the repo's tracker: its fields, labels, links and state",
	positionals: [{ key: "key", message: "Issue (#12, ENG-42):", type: "input" }],
	options: [
		{ key: "title", flag: "--title", type: "input", message: "New title:" },
		{ key: "body", flag: "--body", type: "input", message: "New text:" },
		{ key: "bodyFile", flag: "--body-file", type: "input", message: "File with the new text (- for stdin):" },
		{ key: "state", flag: "--state", type: "select", choices: ["open", "closed"], message: "State:" },
		{ key: "addLabel", flag: "--add-label", type: "input", message: "Label to add:" },
		{ key: "removeLabel", flag: "--remove-label", type: "input", message: "Label to remove:" },
		{ key: "assignee", flag: "--assignee", type: "input", message: "Assignee (login, or me):" },
		{ key: "milestone", flag: "--milestone", type: "input", message: "Milestone (number or title):" },
		{ key: "unblock", flag: "--unblock", type: "input", message: "Blocker to take off (key):" },
		{
			key: "clear",
			flag: "--clear",
			type: "select",
			choices: ["assignee", "milestone", "parent", "type", "priority", "effort", "start-date", "target-date"],
			message: "Field to empty:",
		},
		...ISSUE_FIELD_MENU_OPTIONS,
	],
	skipOptions: ["yes"],
	supportsDryRun: true,
};
