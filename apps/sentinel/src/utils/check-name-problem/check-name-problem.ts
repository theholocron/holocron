/** The verbs a Sentinel check's action may start with. A new verb is a deliberate edit of this list. */
export const CHECK_ACTION_VERBS: readonly string[] = ["Run", "Validate"];

const GROUP = /^[A-Z][a-z]+(?: [A-Z][a-z]+)*$/;
const EVENT_SUFFIX = / \([a-z_]+\)$/;

/**
 * What is wrong with a Sentinel check name, or `undefined` when it has the shape `ci-sentinel-check-names` (#2036) sets:
 * exactly two tiers joined by one ' / ', a Title Case group, and an action whose first word is one of
 * `CHECK_ACTION_VERBS` followed by what it acts on (a tool, acronym or proper noun inside it keeps its own casing). A
 * trailing event name in parentheses, ` (pull_request)`, is left out before the action is read.
 */
export function checkNameProblem(name: string): string | undefined {
	const tiers = name.split(" / ");
	if (tiers.length !== 2) return `must have two tiers joined by one ' / ', found ${tiers.length}`;
	const [group = "", action = ""] = tiers;
	if (!GROUP.test(group)) return `group "${group}" must be Title Case words`;
	const [verb = "", ...rest] = action.replace(EVENT_SUFFIX, "").split(" ");
	if (!CHECK_ACTION_VERBS.includes(verb) || rest.length === 0) {
		return `action "${action}" must start with one of ${CHECK_ACTION_VERBS.join(", ")} followed by what it acts on`;
	}
	return undefined;
}
