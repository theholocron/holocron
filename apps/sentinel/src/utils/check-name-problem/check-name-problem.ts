const GROUP = /^[A-Z][a-z]+(?: [A-Z][a-z]+)*$/;
const ACTION = /^[A-Z][a-z]+ \S.*$/;
const EVENT_SUFFIX = / \([a-z_]+\)$/;

/**
 * What is wrong with a Sentinel check name, or `undefined` when it has the shape `ci-sentinel-check-names` (#2036) sets:
 * exactly two tiers joined by one ' / ', a Title Case group, and an action that starts with a capitalised verb (a tool,
 * acronym or proper noun inside it keeps its own casing). A trailing event name in parentheses, ` (pull_request)`, is
 * left out before the action is read.
 */
export function checkNameProblem(name: string): string | undefined {
	const tiers = name.split(" / ");
	if (tiers.length !== 2) return `must have two tiers joined by one ' / ', found ${tiers.length}`;
	const [group = "", action = ""] = tiers;
	if (!GROUP.test(group)) return `group "${group}" must be Title Case words`;
	if (!ACTION.test(action.replace(EVENT_SUFFIX, ""))) return `action "${action}" must start with a capitalised verb`;
	return undefined;
}
