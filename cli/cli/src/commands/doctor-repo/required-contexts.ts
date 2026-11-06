import { declaredVsActual } from "@theholocron/kyber/ui";

/**
 * Compares the ruleset's required status-check contexts with the ones `requiredChecks()` (from
 * `@theholocron/astromech`) derives: one line per derived context the ruleset lacks (`missing required check`) and one
 * per context it requires that the derived list does not name (`stale context`): a check nobody posts any more, or
 * posts under another name. Empty when they match.
 */
export function compareRequiredContexts(derived: readonly string[], found: readonly string[]): string[] {
	const wanted = new Map(derived.map((c) => [c, true]));
	const actual = new Map(found.map((c) => [c, true]));
	const stale = found
		.filter((c) => !wanted.has(c))
		.map((c) => `stale context ${c} (not in the derived required checks)`);
	return [...declaredVsActual(wanted, actual, { noun: "required check", flagExtra: false }), ...stale];
}
