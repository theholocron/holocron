/** What the `ci` aggregate check waits on, as the two inputs of its reusable workflow. */
export interface AggregateChecks {
	/**
	 * Check ids: each must have a check run named `<id> / ...`. The part of a check context before its first ` / `
	 * (the caller job's name), so a renamed called job or a matrix label cannot break the match.
	 */
	expected: string[];
	/** Commit-status contexts (`codecov/patch`, ...) that must reach `success`. */
	statuses: string[];
}
