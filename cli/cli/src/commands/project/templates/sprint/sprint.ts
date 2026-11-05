import type { BoardTemplate } from "../../../../plugin/index.js";

/** A lightweight iteration board: a status, the sprint an item is in, an active view and a done view. */
export const SPRINT_TEMPLATE: BoardTemplate = {
	name: "sprint",
	statuses: [
		{ name: "Todo", category: "planned", color: "BLUE" },
		{ name: "In Progress", category: "active", color: "YELLOW" },
		{ name: "Blocked", category: "blocked", color: "RED" },
		{ name: "Done", category: "done", color: "GREEN" },
	],
	fields: [{ name: "Sprint", type: "text" }],
	views: [
		{ name: "Active", layout: "table", filter: "-status:Done", default: true },
		{ name: "Done", layout: "table", filter: "status:Done" },
	],
};
