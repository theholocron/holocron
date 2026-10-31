/** How one deep-check step ended: it held, it did not, or it could not be tried. */
export type CheckStatus = "ok" | "fail" | "skip";

/** One step of a deep check, as every `doctor <capability>` prints it. */
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

export interface DeclaredVsActualOptions<T> {
	/** What the things compared are called in the problem lines: `variable`, `secret`, `check`. */
	noun: string;
	/** Whether two values for the same key agree. Defaults to `===`. */
	equal?: (declared: T, actual: T) => boolean;
	/** How a value reads in a problem line. Defaults to `String`. */
	show?: (value: T) => string;
	/** Whether a key found but not declared is a problem. Defaults to `true`. */
	flagExtra?: boolean;
}
