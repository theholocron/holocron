/**
 * The name of a check run Sentinel posts: two tiers, `Group / Action` (`ci-sentinel-check-names`, #2036). The group is
 * the concern in Title Case (`Static Analysis`), the action a capitalised verb phrase (`Run eslint`). No "Sentinel /"
 * prefix: GitHub shows the posting App's name beside the check. `checkNameProblem()` says what is wrong with a name, and
 * a test runs it over every name built here.
 */
export function sentinelCheckName(group: string, action: string): string {
	return `${group} / ${action}`;
}
