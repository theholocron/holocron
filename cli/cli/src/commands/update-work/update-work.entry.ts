import { type MenuEntry } from "@theholocron/kyber/menu";

import { ISSUE_FIELD_MENU_OPTIONS } from "../issue-fields/add-issue-field-options/index.js";

export const updateWorkEntry: MenuEntry = {
	name: "update work",
	description: "Keep an issue, its pull request and the board in step: fields, labels, area labels and status",
	positionals: [{ key: "issue", message: "Issue (#1234, owner/repo#1234 or the tracker's key):", type: "input" }],
	options: [
		{ key: "title", flag: "--title", type: "input", message: "Pull request title (a Conventional Commit line):" },
		{ key: "issueTitle", flag: "--issue-title", type: "input", message: "New issue title:" },
		{ key: "label", flag: "--label", type: "input", message: "Label to add:" },
		{ key: "removeLabel", flag: "--remove-label", type: "input", message: "Label to remove:" },
		{ key: "assignee", flag: "--assignee", type: "input", message: "Assignee (login, or me):" },
		{ key: "milestone", flag: "--milestone", type: "input", message: "Milestone (number or title):" },
		{ key: "unblock", flag: "--unblock", type: "input", message: "Blocker to take off (key):" },
		{ key: "start", flag: "--start", type: "confirm", message: "Start the work first (branch, pull request)?" },
		{ key: "status", flag: "--status", type: "input", message: "Board status to set by hand (temporary):" },
		...ISSUE_FIELD_MENU_OPTIONS,
	],
	skipOptions: ["yes", "pr", "name", "base", "spec", "one-pr", "force", "board"],
	supportsDryRun: true,
};
