import type { MenuEntry } from "@theholocron/kyber/menu";

type MenuOption = NonNullable<MenuEntry["options"]>[number];

/** How the issue-field flags are offered through the interactive menu, for `new issue` and `update issue`. */
export const ISSUE_FIELD_MENU_OPTIONS: MenuOption[] = [
	{
		key: "type",
		flag: "--type",
		type: "select",
		choices: ["bug", "feature", "task"],
		message: "Kind of issue:",
	},
	{
		key: "priority",
		flag: "--priority",
		type: "select",
		choices: ["urgent", "high", "medium", "low"],
		message: "Priority:",
	},
	{ key: "effort", flag: "--effort", type: "select", choices: ["high", "medium", "low"], message: "Effort:" },
	{ key: "startDate", flag: "--start-date", type: "input", message: "Start date (YYYY-MM-DD):" },
	{ key: "targetDate", flag: "--target-date", type: "input", message: "Target date (YYYY-MM-DD):" },
	{ key: "parent", flag: "--parent", type: "input", message: "Parent issue (key):" },
	{ key: "blockedBy", flag: "--blocked-by", type: "input", message: "Blocked by (key):" },
	{ key: "project", flag: "--project", type: "input", message: "Board (a declared name):" },
	{ key: "area", flag: "--area", type: "input", message: "Area (from repo.labels.areas):" },
];
