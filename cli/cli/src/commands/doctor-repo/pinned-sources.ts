/**
 * Compares the app each required context is pinned to with the declared pins: one line per declared pin the ruleset
 * lacks or sets to another app, and one per pin the ruleset holds that nothing declares (the option was turned off or
 * the id changed). Empty when they match. Ids are the integration ids of GitHub Apps, never credentials.
 */
export function comparePinnedSources(
	declared: Readonly<Record<string, number>>,
	found: Readonly<Record<string, number>>
): string[] {
	const problems: string[] = [];
	for (const [context, id] of Object.entries(declared)) {
		const actual = found[context];
		if (actual === undefined)
			problems.push(`${context} is not pinned (declared app ${id}; any app may satisfy it)`);
		else if (actual !== id) problems.push(`${context} is pinned to app ${actual}, declared app ${id}`);
	}
	for (const [context, id] of Object.entries(found)) {
		if (declared[context] === undefined)
			problems.push(`${context} is pinned to app ${id} but ci.pin does not declare it`);
	}
	return problems;
}
