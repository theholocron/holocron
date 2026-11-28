/**
 * The line numbers (1-indexed, in the file as the pull request leaves it) that the pull request adds to one file,
 * from its unified-diff `patch`: every `+` line, never a context or a removed line. `undefined` for a missing patch
 * (GitHub omits it for a binary file and for a very large diff), which means "not known" and not "no lines": a caller
 * that scopes work to the pull request's own lines treats it as the whole file.
 */
export function addedLines(patch: string | undefined): Set<number> | undefined {
	if (!patch) return undefined;
	const lines = new Set<number>();
	let right: number | undefined;
	for (const line of patch.split("\n")) {
		const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
		if (hunk) {
			right = Number(hunk[1]);
			continue;
		}
		if (right === undefined) continue;
		if (line.startsWith("+")) {
			lines.add(right);
			right++;
		} else if (line.startsWith(" ")) {
			right++;
		}
		// "-" lines exist only on the LEFT side; "\ No newline at end of file" is metadata.
	}
	return lines;
}
