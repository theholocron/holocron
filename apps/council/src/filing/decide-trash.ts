import { readProperty } from "../frontmatter/read-property.js";
import type { TrashDecision } from "./filing.type.js";

/**
 * Step (d): the note is trashed only when it, read again after the sync, carries an `issue:`. `outputTail` is the end
 * of the sync's own output (a skipped attachment, an error), which becomes the reason the note was kept.
 */
export function decideTrash(after: string, outputTail: string): TrashDecision {
	const issue = readProperty(after, "issue");
	if (issue !== undefined) return { trash: true, issue };
	const detail = outputTail === "" ? "The command printed nothing." : outputTail;
	return { trash: false, reason: `The note has no issue yet, so it was kept.\n${detail}` };
}
