/**
 * The name of a check run Sentinel posts: `<task id> / <Action>` (`ci-sentinel-check-names`, #2036; the temporary `sentinel:` prefix went with #2263). The task id
 * is the lowercase colon id of the task whose job the check does (`lint:code`, `typecheck`, `validate:specs`), as in the
 * Actions checks; the action is one of the allowed verbs followed by what it acts on (`Run eslint`). No "Sentinel /"
 * prefix: GitHub shows the posting App's name beside the check. `checkNameProblem()` says what is wrong with a name,
 * and a test runs it over every name built here.
 */
export function sentinelCheckName(taskId: string, action: string): string {
	return `${taskId} / ${action}`;
}
