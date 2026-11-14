import type { Matrix, MatrixCell } from "./doctor-secrets.type.js";

/**
 * The line under the table: how many names it lists and how its cells came out, in the words of the legend, so it
 * counts what the reader sees and not the rows below. `n/a` is not counted; `?` is shown only when a place could not be
 * read. Checks that failed (the rows with a ✗, for what the table does not show) are added at the end.
 *
 * @param matrix - The matrix that was printed.
 * @param failed - How many rows failed.
 */
export function matrixSummary(matrix: Matrix, failed: number): string {
	const rows = [...matrix.secrets, ...matrix.variables];
	const names = new Set(rows.map((row) => row.name.toUpperCase())).size;
	const count = (cell: MatrixCell): number =>
		rows.reduce((total, row) => total + Object.values(row.cells).filter((c) => c === cell).length, 0);
	const unread = count("?");
	return [
		`${names} ${names === 1 ? "name" : "names"}: ${count("ok")} ok, ${count("MISSING")} MISSING, ${count("extra")} extra`,
		...(unread > 0 ? [`, ${unread} not read`] : []),
		...(failed > 0 ? [`; ${failed} ${failed === 1 ? "check" : "checks"} failed`] : []),
	].join("");
}
