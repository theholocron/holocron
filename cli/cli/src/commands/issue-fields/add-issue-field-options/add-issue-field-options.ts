import type { Argv } from "yargs";

import type { IssueFieldArgs } from "./add-issue-field-options.type.js";

/**
 * Declares the issue-field flags `new issue` and `update issue` share (spec `tool-work-commands`): `--type`,
 * `--priority`, `--effort`, `--start-date`, `--target-date`, `--parent`, `--blocked-by`, `--project` and `--area`.
 * The values are checked here (`choices`) or by the run (dates, areas).
 */
export function addIssueFieldOptions<T>(y: Argv<T>): Argv<T & IssueFieldArgs> {
	return y
		.option("type", {
			type: "string",
			describe:
				"The issue's kind: bug, feature, task or a Type the organization declares (GitHub's issue Type, a label on Linear)",
		})
		.option("priority", {
			type: "string",
			choices: ["urgent", "high", "medium", "low"] as const,
			describe: "How urgent it is",
		})
		.option("effort", {
			type: "string",
			choices: ["high", "medium", "low"] as const,
			describe: "How much work it is",
		})
		.option("start-date", { type: "string", describe: "When work starts, YYYY-MM-DD" })
		.option("target-date", { type: "string", describe: "When it is due, YYYY-MM-DD" })
		.option("parent", { type: "string", describe: "The key of the issue it is a sub-issue of" })
		.option("blocked-by", {
			type: "string",
			array: true,
			describe: "The key of an issue that blocks it (repeatable)",
		})
		.option("project", { type: "string", describe: "Put it on this board (a name `providers.projects` declares)" })
		.option("area", {
			type: "string",
			array: true,
			describe: "An area of the repo, from `repo.labels.areas`; adds the label `area:<name>` (repeatable)",
		});
}
