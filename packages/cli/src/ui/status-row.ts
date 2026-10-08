import { style } from "./style.js";

export type RowStatus = "ok" | "fail" | "skip";

/** Right-pads `s` to `width` with spaces — never truncates. */
export function pad(s: string, width: number): string {
	return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/**
 * One row of a status report: a 2-space indent, the status icon (✓ / ✗ / ·),
 * then `columns` joined with a two-space gap (blank columns dropped, so a
 * row that has nothing for its last column doesn't trail whitespace).
 * Column padding (`pad`) is the caller's job — `doctor` pads capability and
 * provider to a fixed width; `clone`'s repo names and paths don't, since
 * they vary too widely for fixed-width alignment to read cleanly.
 *
 * Shared by `doctor` (capability / provider / message) and `clone` (repo /
 * destination / reason) so every status table in the CLI reads the same way.
 */
export function statusRow(status: RowStatus, columns: string[]): string {
	const joined = columns.filter((c) => c.length > 0).join("  ");
	const styled =
		status === "ok" ? style.success(joined) : status === "fail" ? style.fail(joined) : style.skip(joined);
	return `  ${styled}`;
}
