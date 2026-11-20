import type { IssueFieldArgs, IssueFieldInput } from "./add-issue-field-options.type.js";

/** The issue-field flags that were given, in the words of the run functions; a flag not given is absent. */
export function readIssueFieldArgs(argv: IssueFieldArgs): IssueFieldInput {
	return {
		...(argv.type ? { kind: argv.type } : {}),
		...(argv.priority ? { priority: argv.priority } : {}),
		...(argv.effort ? { effort: argv.effort } : {}),
		...(argv.startDate ? { startDate: String(argv.startDate) } : {}),
		...(argv.targetDate ? { targetDate: String(argv.targetDate) } : {}),
		...(argv.parent ? { parent: String(argv.parent) } : {}),
		...(argv.blockedBy ? { blockedBy: argv.blockedBy.map(String) } : {}),
		...(argv.project ? { project: String(argv.project) } : {}),
		...(argv.area ? { areas: argv.area.map(String) } : {}),
	};
}
