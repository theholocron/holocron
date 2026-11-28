import type { RowStatus } from "../status-row/index.js";

/** How one step of a deep check ended: it held, it did not, or it could not be tried. */
export type CheckStatus = RowStatus;

/** One step of a deep check, as a CLI's check commands print it. */
export interface CheckRow {
	id: string;
	title: string;
	status: CheckStatus;
	/** One line: what was found, or why it failed or was skipped. */
	detail: string;
	/** For a failing row, one line per thing that is wrong. */
	problems: string[];
}

/** The counts on the closing `N ok, N fail, N skipped` line. */
export interface CheckSummary {
	ok: number;
	fail: number;
	skip: number;
}
