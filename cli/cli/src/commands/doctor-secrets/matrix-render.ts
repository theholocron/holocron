import type { Matrix, MatrixColumn, MatrixRow } from "./doctor-secrets.type.js";

/** What each cell word means. Printed under the matrix every time, one meaning per line. */
export const MATRIX_LEGEND: readonly string[] = [
	"ok       present where it should be",
	"n/a      not needed here",
	"MISSING  needed here, not found",
	"extra    found here, but nothing feeds it",
	"?        could not read this place",
];

const heading = (column: MatrixColumn): string => `${column.group} ${column.label}`;

function pad(text: string, width: number): string {
	return text + " ".repeat(Math.max(0, width - text.length));
}

/** The block as a table: one line per name, one column per place. */
function table(name: string, rows: MatrixRow[], columns: MatrixColumn[]): string[] {
	const nameWidth = Math.max(name.length, ...rows.map((row) => row.name.length));
	const widths = columns.map((column) =>
		Math.max(heading(column).length, ...rows.map((row) => row.cells[column.id]!.length))
	);
	const line = (first: string, cells: string[]) =>
		[pad(first, nameWidth), ...cells.map((cell, i) => pad(cell, widths[i]!))].join("  ").trimEnd();
	return [
		line(
			name,
			columns.map((column) => heading(column))
		),
		...rows.map((row) =>
			line(
				row.name,
				columns.map((column) => row.cells[column.id]!)
			)
		),
	];
}

/** The block turned on its side: one short paragraph per name, for a terminal too narrow for the table. */
function stacked(rows: MatrixRow[], columns: MatrixColumn[]): string[] {
	return rows.flatMap((row) => [
		row.name,
		...columns.map((column) => `  ${heading(column)}: ${row.cells[column.id]}`),
	]);
}

function block(title: string, noun: string, rows: MatrixRow[], columns: MatrixColumn[], width: number): string[] {
	if (rows.length === 0) return [title, `  (no ${noun} declared or found)`];
	const wide = table("name", rows, columns);
	return [title, ...(Math.max(...wide.map((l) => l.length)) <= width ? wide : stacked(rows, columns))];
}

/**
 * Lays the matrix out as text: a heading and a block for the secrets, the same for the variables, then the legend.
 * The cells are words, not symbols or colour, so a pipe or a log reads the same. When the table would pass `width`
 * columns it is turned on its side (one paragraph per name) instead of wrapping mid-row.
 *
 * @param matrix - The matrix.
 * @param width - The terminal's width in columns.
 * @param only - Show only one block.
 */
export function renderMatrix(matrix: Matrix, width: number, only?: "secrets" | "variables"): string[] {
	const out: string[] = [];
	if (only !== "variables")
		out.push(...block("Secrets", "secrets", matrix.secrets, matrix.columns.secret, width), "");
	if (only !== "secrets") {
		out.push(...block("Variables", "variables", matrix.variables, matrix.columns.variable, width), "");
	}
	out.push("Legend", ...MATRIX_LEGEND.map((line) => `  ${line}`));
	return out;
}
