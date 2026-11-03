import { KNOWN_TASKS, KNOWN_WORKFLOWS, LEGACY_NAMES } from "@theholocron/astromech";

/** The six group names a caller workflow had before its name became the task id. */
const GROUP_NAMES = new Set(["Verification", "Source Quality", "Security", "Delivery", "Platform", "Knowledge"]);

/** What a task id looks like: lowercase letters and digits, with a hyphen or a colon inside. */
const ID = /^[a-z][a-z0-9:-]*$/;

/** The unquoted text of a YAML list entry's value. */
const unquote = (value: string) => value.trim().replace(/^(["'])(.*)\1$/, "$2");

/**
 * Problems with the workflow names a workflow lists under `workflow_run: workflows:`, as human-readable lines: one for
 * each name that is an old group name (`Verification`), an old dotted task name or a lowercase name that is no task id.
 * A caller's workflow `name:` is its task id, so a listed id that no task has matches no run and its failures are never
 * posted. A name that is not shaped like an id (`Sentinel Deploy`) is a hand-written workflow's own name and is left
 * alone: this reads the text, not the repo's workflows.
 */
export function workflowNameProblems(text: string): string[] {
	const list = /^ {2}workflow_run:\n {4}workflows:\n((?: {6}- [^\n]+\n)+)/m.exec(text)?.[1] ?? "";
	const names = [...list.matchAll(/^ {6}- ([^\n#]+)/gm)].map((m) => unquote(m[1]!));
	return names.flatMap((name) => {
		if (GROUP_NAMES.has(name)) return [`${name}: an old group name; a caller's workflow is named for its task id`];
		if (!ID.test(name)) return [];
		if (name in LEGACY_NAMES) return [`${name}: an old task name; a caller's workflow is named for its task id`];
		return KNOWN_TASKS.has(name) || KNOWN_WORKFLOWS.has(name)
			? []
			: [`${name}: no task has this id, so no run carries this workflow name`];
	});
}
