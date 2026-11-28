/**
 * The lines a unified diff (`git diff -U0`) adds or changes, by file: from each hunk header
 * `@@ -a,b +c,d @@`, the new-file lines `c` … `c + d - 1` (a missing `d` is one line, `0` is a pure deletion).
 */
export function addedLines(diff: string): Map<string, Set<number>> {
	const out = new Map<string, Set<number>>();
	let file: string | undefined;
	for (const line of diff.split("\n")) {
		if (line.startsWith("+++ ")) {
			file = line === "+++ /dev/null" ? undefined : line.replace(/^\+\+\+ b\//, "");
			continue;
		}
		const hunk = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/.exec(line);
		if (!hunk || !file) continue;
		const start = Number(hunk[1]);
		const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
		const lines = out.get(file) ?? new Set<number>();
		for (let i = 0; i < count; i++) lines.add(start + i);
		out.set(file, lines);
	}
	return out;
}
