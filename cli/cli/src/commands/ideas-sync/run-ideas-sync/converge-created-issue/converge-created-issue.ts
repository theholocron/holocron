import { describeError } from "@theholocron/kyber/ui";

import type { Issue, Issues } from "../../../../plugin/index.js";
import { pickCanonicalIssue } from "../pick-canonical-issue/index.js";
import { SEARCH_LIMIT } from "../search-limit/index.js";
import type { ConvergedIssue } from "./converge-created-issue.type.js";

/**
 * Makes the creation of an issue converge when two runs file the same idea at the same time. Both runs searched for
 * the marker before either created, so both created; each now searches again, and the oldest issue carrying the exact
 * `marker` (by {@link pickCanonicalIssue}: the oldest open one) is the winner. Both runs see the same issues, so they pick the same winner: the
 * run whose issue is the oldest keeps it, and the other comments on its own issue and closes it (`transition` to
 * `done`; the `Issues` capability has no closed-as-duplicate state), then reports the winner's key. Nothing here throws.
 * When a winner other than `created` is known, its key is always the one returned, so the note points at the canonical
 * issue even if commenting or closing the duplicate does not go through (then `warning` is set and the detail names
 * both keys). When the search itself does not go through no winner is known, so `created` is returned with a warning,
 * because a created issue is never left out of the note.
 *
 * @param issues - The tracker; only `search`, `comment` and `transition` are used.
 * @param marker - The exact hidden marker line of the idea, as written in the issue body.
 * @param created - The key of the issue this run has just created.
 */
export async function convergeCreatedIssue(
	issues: Pick<Issues, "search" | "comment" | "transition">,
	marker: string,
	created: string
): Promise<ConvergedIssue> {
	let candidates: Array<Pick<Issue, "key" | "statusCategory">>;
	try {
		const found = await issues.search({ text: marker, limit: SEARCH_LIMIT });
		candidates = found.filter((issue) => issue.body?.includes(marker) && issue.key !== created);
	} catch (err) {
		return {
			key: created,
			warning: true,
			detail: `filed as ${created}; could not check for a duplicate from an overlapping run (${describeError(err)}), so look for another issue with the same marker and close one by hand`,
		};
	}
	// Our own issue is open and always a candidate, so there is always a winner.
	const winner = (pickCanonicalIssue([...candidates, { key: created, statusCategory: "open" }]) as { key: string })
		.key;
	if (winner === created) return { key: created, warning: false, detail: `filed as ${created}` };
	try {
		await issues.comment(created, `Duplicate of ${winner}: the same idea was filed by two overlapping runs.`);
		await issues.transition(created, "done");
	} catch (err) {
		return {
			key: winner,
			warning: true,
			detail: `filed as ${winner}, the older issue for the idea, but the duplicate ${created} could not be closed (${describeError(err)}); close ${created} by hand`,
		};
	}
	return {
		key: winner,
		warning: false,
		detail: `filed as ${winner} (closed duplicate ${created} from an overlapping run)`,
	};
}
