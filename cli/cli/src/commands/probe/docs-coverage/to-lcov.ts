import type { PackageDocs } from "./docs-coverage.type.js";

/**
 * The documented/undocumented symbols as an lcov report, one `DA` line per symbol (hit when it has a doc
 * comment), so a coverage service reads doc coverage like line coverage and can show it for the lines a PR changes.
 */
export function toLcov(packages: PackageDocs[]): string {
	const byFile = new Map<string, Map<number, boolean>>();
	for (const { symbols } of packages) {
		for (const { file, line, documented } of symbols) {
			const lines = byFile.get(file) ?? new Map<number, boolean>();
			// two symbols on one line (a member and its type) count as documented only when both are
			lines.set(line, (lines.get(line) ?? true) && documented);
			byFile.set(file, lines);
		}
	}
	const out: string[] = ["TN:"];
	for (const [file, lines] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
		const sorted = [...lines].sort(([a], [b]) => a - b);
		out.push(`SF:${file}`);
		for (const [line, documented] of sorted) out.push(`DA:${line},${documented ? 1 : 0}`);
		out.push(`LF:${sorted.length}`, `LH:${sorted.filter(([, d]) => d).length}`, "end_of_record");
	}
	return `${out.join("\n")}\n`;
}
