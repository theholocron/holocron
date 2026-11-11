/**
 * Put in front of every check name Sentinel posts while the GitHub Actions checks of the same task ids still run
 * (`ci-sentinel-check-names`, #2036), so the two never share a name and the `ci` aggregate, which waits for
 * `<task id> / ...`, does not count Sentinel's checks. When the Actions checks go, set this to `""`: nothing else
 * in the code spells it, and the rulesets that require a Sentinel check change in the same step.
 */
export const SENTINEL_CHECK_PREFIX = "sentinel:";

/**
 * The name of a check run Sentinel posts: `<prefix><task id> / <Action>` (`ci-sentinel-check-names`, #2036). The task id
 * is the lowercase colon id of the task whose job the check does (`lint:code`, `typecheck`, `validate:specs`), as in the
 * Actions checks; the action is one of the allowed verbs followed by what it acts on (`Run eslint`). No "Sentinel /"
 * prefix: GitHub shows the posting App's name beside the check. `checkNameProblem()` says what is wrong with a name,
 * and a test runs it over every name built here.
 */
export function sentinelCheckName(taskId: string, action: string): string {
	return `${SENTINEL_CHECK_PREFIX}${taskId} / ${action}`;
}
