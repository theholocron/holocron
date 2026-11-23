import type { IssueEffort, IssueKind, IssuePriority } from "../../../plugin/index.js";

/** The issue-field flags `new issue` and `update issue` share, as yargs parses them. */
export interface IssueFieldArgs {
	type?: string;
	priority?: Exclude<IssuePriority, "none">;
	effort?: IssueEffort;
	startDate?: string;
	targetDate?: string;
	parent?: string;
	blockedBy?: string[];
	project?: string;
	area?: string[];
}

/** The same fields as a run function takes them: names in the capability's words, and only what was given. */
export interface IssueFieldInput {
	/** The issue's kind (`--type`). */
	kind?: IssueKind;
	/** How urgent it is. */
	priority?: Exclude<IssuePriority, "none">;
	/** How much work it is. */
	effort?: IssueEffort;
	/** When work starts, `YYYY-MM-DD`. */
	startDate?: string;
	/** When it is due, `YYYY-MM-DD`. */
	targetDate?: string;
	/** The key of its parent issue. */
	parent?: string;
	/** Keys of the issues that block it. */
	blockedBy?: string[];
	/** The declared board to put it on, by name. */
	project?: string;
	/** Area names (`repo.labels.areas`); each becomes the label `area:<name>`. */
	areas?: string[];
}
