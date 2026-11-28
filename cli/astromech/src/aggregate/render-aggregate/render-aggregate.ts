import type { AggregateAnnotation, AggregateRow } from "../evaluate-aggregate/evaluate-aggregate.type.js";

const RANK: Record<AggregateRow["state"], number> = { failure: 0, missing: 1, pending: 2, success: 3 };

/** Renders the failing-first Markdown table of the rows and one error annotation per row that is not a success. */
export function renderAggregate(rows: AggregateRow[]): { summary: string; annotations: AggregateAnnotation[] } {
	const lines = ["## ci", "", "| Check | Result | Link |", "| --- | --- | --- |"];
	for (const row of [...rows].sort((a, b) => RANK[a.state] - RANK[b.state])) {
		const result = `${row.state === "success" ? "pass" : "FAIL"}: ${row.detail}`;
		lines.push(`| \`${row.id}\` | ${result} | ${row.url === null ? "none" : `[open](${row.url})`} |`);
	}
	const annotations = rows
		.filter((row) => row.state !== "success")
		.map((row) => ({ title: row.id, message: `${row.detail} ${row.url ?? ""}`.trim() }));
	return { summary: lines.join("\n"), annotations };
}
