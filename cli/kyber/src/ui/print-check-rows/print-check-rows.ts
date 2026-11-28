import type { CheckRow } from "../check-row/index.js";
import { statusRow } from "../status-row/index.js";

/** One row per step, titles padded to the widest, each problem on its own indented line. */
export function printCheckRows(rows: readonly CheckRow[], print: (line: string) => void): void {
	const width = Math.max(0, ...rows.map((row) => row.title.length));
	for (const row of rows) {
		print(statusRow(row.status, [row.title.padEnd(width), row.detail]));
		for (const problem of row.problems) print(`      - ${problem}`);
	}
}
