import type { Reference, ReferenceKind, ScannedRepo } from "./references.type.js";

/** The repository that hosts the files; its own references are the starters and shims, not callers. */
export const HOST_REPO = ".github";

/** What a reference points at, from the text after the needle. */
export function kindOf(line: string, needle: string): ReferenceKind {
	const rest = line.slice(line.indexOf(needle) + needle.length);
	if (rest.startsWith("workflows/")) return "workflow";
	if (rest.startsWith("actions/")) return "action";
	return "other";
}

/** Every line of every file of `repo` that contains `needle`. */
export function findReferences(repo: ScannedRepo, needle: string): Reference[] {
	const found: Reference[] = [];
	for (const file of repo.files()) {
		file.text.split("\n").forEach((line, index) => {
			if (!line.includes(needle)) return;
			found.push({
				repo: repo.name,
				file: file.path,
				line: index + 1,
				kind: kindOf(line, needle),
				text: line.trim(),
			});
		});
	}
	return found;
}
