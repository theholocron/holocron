import type { IssueOrder } from "../../capabilities/index.js";

/** What {@link readKeysLimited} needs. */
export interface ReadKeysLimitedInput<T> {
	/** The issue keys to choose from. */
	keys: readonly string[];
	/** Which end of the creation order to take first. */
	order: IssueOrder;
	/** How many items to keep. */
	limit: number;
	/** The most issues fetched at once. */
	concurrency: number;
	/** Fetches one issue by key. */
	fetch: (key: string) => Promise<T>;
	/** Whether a fetched issue counts against the limit; false skips it without using the budget. */
	keep: (item: T) => boolean;
}
