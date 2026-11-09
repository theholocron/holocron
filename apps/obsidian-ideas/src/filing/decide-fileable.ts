import { readProperty } from "../frontmatter/read-property.js";
import type { FileableDecision } from "./filing.type.js";

/** Step (a): a note already in the filing state that carries an `issue:` is filed, so there is nothing to do. */
export function decideFileable(text: string, fileState: string): FileableDecision {
	const issue = readProperty(text, "issue");
	if (readProperty(text, "status") === fileState && issue !== undefined) {
		return { ok: false, reason: `This idea is already filed as ${issue}.` };
	}
	return { ok: true };
}
