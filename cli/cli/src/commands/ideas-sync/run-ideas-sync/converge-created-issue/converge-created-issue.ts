import { describeError } from "@theholocron/kyber/ui";

import type { Issues } from "../../../../plugin/index.js";
import { oldestIssueKey } from "../oldest-issue-key/index.js";
import type { ConvergedIssue } from "./converge-created-issue.type.js";

/** How many text matches are read back when looking for a twin; the same bound the first search uses. */
const SEARCH_LIMIT = 20;

/**
 * Makes the creation of an issue converge when two runs file the same idea at the same time. Both runs searched for
 * the marker before either created, so both created; each now searches again, and the oldest issue carrying the exact
 * `marker` (by {@link oldestIssueKey}) is the winner. Both runs see the same issues, so they pick the same winner: the
 * run whose issue is the oldest keeps it, and the other comments on its own issue and closes it (`transition` to
 * `done`; the `Issues` capability has no closed-as-duplicate state), then reports the winner's key. Nothing here throws:
 * a search, comment or close that does not go through keeps `created` and sets `warning`, with both keys named in the
 * detail, because a created issue is never left out of the note.
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
	let twins: string[];
	try {
		const found = await issues.search({ text: marker, limit: SEARCH_LIMIT });
		twins = found
			.filter((issue) => issue.body?.includes(marker) && issue.key !== created)
			.map((issue) => issue.key);
	} catch (err) {
		return {
			key: created,
			warning: true,
			detail: `filed as ${created}; could not check for a duplicate from an overlapping run (${describeError(err)}), so look for another issue with the same marker and close one by hand`,
		};
	}
	// The list holds `created`, so there is always an oldest key.
	const winner = oldestIssueKey([created, ...twins]) as string;
	if (winner === created) return { key: created, warning: false, detail: `filed as ${created}` };
	try {
		await issues.comment(created, `Duplicate of ${winner}: the same idea was filed by two overlapping runs.`);
		await issues.transition(created, "done");
	} catch (err) {
		return {
			key: created,
			warning: true,
			detail: `filed as ${created}, but ${winner} is an older issue for the same idea and ${created} could not be closed (${describeError(err)}); close the duplicate by hand`,
		};
	}
	return {
		key: winner,
		warning: false,
		detail: `filed as ${winner} (closed duplicate ${created} from an overlapping run)`,
	};
}
