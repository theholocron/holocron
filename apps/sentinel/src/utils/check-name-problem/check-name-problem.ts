import { SENTINEL_CHECK_PREFIX } from "../sentinel-check-name/index.js";

/** The verbs a Sentinel check's action may start with. A new verb is a deliberate edit of this list. */
export const CHECK_ACTION_VERBS: readonly string[] = ["Run", "Validate"];

const TASK_ID = /^[a-z]+(?:[:-][a-z]+)*$/;
const EVENT_SUFFIX = / \([a-z_]+\)$/;

/**
 * What is wrong with a Sentinel check name, or `undefined` when it has the shape `ci-sentinel-check-names` (#2036) sets:
 * `SENTINEL_CHECK_PREFIX`, a lowercase task id (`lint:code`), one ' / ', and an action whose first word is one of
 * `CHECK_ACTION_VERBS` followed by what it acts on (a tool, acronym or proper noun inside it keeps its own casing). A
 * trailing event name in parentheses, ` (pull_request)`, is left out before the action is read.
 */
export function checkNameProblem(name: string): string | undefined {
	const tiers = name.split(" / ");
	if (tiers.length !== 2) return `must have two tiers joined by one ' / ', found ${tiers.length}`;
	const [head = "", action = ""] = tiers;
	if (!head.startsWith(SENTINEL_CHECK_PREFIX)) return `"${head}" must start with "${SENTINEL_CHECK_PREFIX}"`;
	const taskId = head.slice(SENTINEL_CHECK_PREFIX.length);
	if (!TASK_ID.test(taskId)) return `task id "${taskId}" must be lowercase words joined by ':' or '-'`;
	const [verb = "", ...rest] = action.replace(EVENT_SUFFIX, "").split(" ");
	if (!CHECK_ACTION_VERBS.includes(verb) || rest.length === 0) {
		return `action "${action}" must start with one of ${CHECK_ACTION_VERBS.join(", ")} followed by what it acts on`;
	}
	return undefined;
}
