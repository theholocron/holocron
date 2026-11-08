import { AUTO_FIX_SUBJECTS, type AutoFixKind } from "../auto-fix-subjects/index.js";

/**
 * The auto-fix kinds that have already committed since the last commit that is not an auto-fix, given the pull
 * request's commit messages oldest first. A kind in this list that finds work to do again means something undid
 * its fix (typically another fixer whose output the first one rejects), so committing it once more only repeats
 * the loop: markdownlint and prettier disagreeing about one line made 34 commits in 26 minutes on #1949.
 *
 * Normal runs never trip this: each fixer commits once, the next delivery finds nothing to fix, and a person's
 * push ends the run, so a new unformatted line is fixed again.
 */
export function blockedAutoFixKinds(messages: string[]): AutoFixKind[] {
	const kinds = Object.keys(AUTO_FIX_SUBJECTS) as AutoFixKind[];
	const committed = new Set<AutoFixKind>();
	for (let i = messages.length - 1; i >= 0; i--) {
		const subject = messages[i]!.split("\n")[0]!.trim();
		const kind = kinds.find((k) => AUTO_FIX_SUBJECTS[k] === subject);
		if (!kind) break;
		committed.add(kind);
	}
	return kinds.filter((k) => committed.has(k));
}
