import type { CiAggregatePoster } from "@theholocron/astromech/config";
import type { CheckRow } from "@theholocron/kyber/ui";
import { declaredVsActual } from "@theholocron/kyber/ui";

import type { ParsedCaller } from "./doctor-ci.type.js";
import { problemRow } from "./problem-row.js";

/** The ids of a list, as a map for {@link declaredVsActual}. */
const byId = (ids: readonly string[]) => new Map(ids.map((id) => [id, id]));

/**
 * The `aggregate` row: the `expected` list in the `ci` aggregate caller (`ci.ci.yml`, or `ci.yml` in a repo that does
 * not host the reusables) is the list the configured tasks derive (`aggregateChecks()`), with no id missing and none
 * stale. A skip when the repo has no aggregate caller, which only the repo that hosts the reusables writes today. The
 * ruleset that requires the aggregate is `doctor repo`'s to compare, not this row's.
 */
export function aggregateRow(
	callers: readonly ParsedCaller[],
	derived: readonly string[],
	poster: CiAggregatePoster = "actions"
): CheckRow {
	const id = "aggregate";
	const title = "ci aggregate lists the configured tasks";
	if (poster === "none") {
		// Declared absent (`ci.aggregate: none`): each check is required on its own, so a caller that is left would post a check nobody requires.
		const left = callers.find((caller) => caller.file === "ci.ci.yml" || caller.file === "ci.yml");
		return left === undefined
			? {
					id,
					title,
					status: "ok",
					detail: "there is no aggregate (ci.aggregate: none); the ruleset requires each check on its own",
					problems: [],
				}
			: problemRow(id, title, [`${left.file} is still there, but ci.aggregate says there is no aggregate`], "");
	}
	if (poster === "sentinel") {
		// Declared posted by Sentinel (`ci.aggregate: sentinel`): there is no caller, and one that is left is a second poster.
		const left = callers.find((caller) => caller.file === "ci.ci.yml" || caller.file === "ci.yml");
		return left === undefined
			? {
					id,
					title,
					status: "ok",
					detail: `Sentinel posts the aggregate (ci.aggregate); its expected list derives from the config (${derived.length} ids)`,
					problems: [],
				}
			: problemRow(
					id,
					title,
					[`${left.file} is still there, but ci.aggregate says Sentinel posts the check: two posters`],
					""
				);
	}
	const aggregate = callers.find(
		(caller) => (caller.file === "ci.ci.yml" || caller.file === "ci.yml") && caller.expected !== undefined
	);
	if (aggregate === undefined) {
		return { id, title, status: "skip", detail: "no ci aggregate caller", problems: [] };
	}
	const problems = declaredVsActual(byId(derived), byId(aggregate.expected!), { noun: "id" }).map((line) =>
		line.startsWith("unexpected id ")
			? `stale id ${line.slice("unexpected id ".length)} (no configured task)`
			: line
	);
	return problemRow(id, title, problems, `${derived.length} of ${derived.length} ids match`);
}
