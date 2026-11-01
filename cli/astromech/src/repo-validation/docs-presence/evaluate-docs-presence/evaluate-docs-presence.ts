import type { DocsPresenceResult, SkipDocs } from "../docs-presence.type.js";
import { hasDocsSignal } from "../has-docs-signal/index.js";
import { pageNames } from "../page-names/index.js";

/**
 * Sorts the packages a feature changed into those that need a warning (no docs signal, and no `[skip docs]` marker
 * with a reason that covers them) and those a marker excused. A marker with no reason excuses nothing.
 */
export function evaluateDocsPresence(input: {
	packages: readonly string[];
	changedFiles: readonly string[];
	addedCommentLines: (dir: string) => readonly string[];
	skip: SkipDocs | null;
}): DocsPresenceResult {
	const { packages, changedFiles, addedCommentLines, skip } = input;
	const result: DocsPresenceResult = { warn: [], skipped: [], missingReason: false };
	for (const dir of packages) {
		if (hasDocsSignal(dir, changedFiles, addedCommentLines(dir))) continue;
		const covered =
			skip !== null && (skip.scope === null || skip.scope.some((s) => s === dir || pageNames(dir).includes(s)));
		if (covered && skip.reason) {
			result.skipped.push({ dir, reason: skip.reason });
			continue;
		}
		if (covered) result.missingReason = true;
		result.warn.push(dir);
	}
	return result;
}
