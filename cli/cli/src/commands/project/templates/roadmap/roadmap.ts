import type { BoardTemplate } from "../../../../plugin/index.js";

/**
 * The org's roadmap board: what is planned, what is moving and what is waiting, with a priority and the three views
 * the maintainers work from. Mirrors project 5 (`v5`), so a new board made from it looks the same.
 */
export const ROADMAP_TEMPLATE: BoardTemplate = {
	name: "roadmap",
	statuses: [
		{
			name: "Someday",
			category: "backlog",
			color: "GRAY",
			description: "Idea or future consideration, not yet planned",
		},
		{ name: "Todo", category: "planned", color: "BLUE", description: "Planned and ready to be worked on" },
		{ name: "In Progress", category: "active", color: "YELLOW", description: "Currently being worked on" },
		{
			name: "Blocked",
			category: "blocked",
			color: "RED",
			description: "Waiting on another issue or an outside change",
		},
		{ name: "Done", category: "done", color: "GREEN", description: "Completed" },
	],
	fields: [
		{ name: "Priority", type: "single_select", options: ["1 · Now", "2 · Next", "3 · Process"] },
		{ name: "Milestone", type: "text" },
	],
	views: [
		{ name: "Active", layout: "board", filter: "-status:Someday -status:Done", default: true },
		{ name: "Backlog", layout: "board", filter: "status:Someday" },
		{ name: "Done", layout: "table", filter: "status:Done" },
	],
	rules: ["Auto-add sub-issues to project"],
};
