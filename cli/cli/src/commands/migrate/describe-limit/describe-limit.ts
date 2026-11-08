import type { IssueOrder } from "../../../plugin/index.js";

/**
 * The line a limited read prints, in a dry run and a real one: `limited to 2 of 7 (oldest created)`, or without the
 * total when the provider could not say how many the selection matched. `read` is how many records came back.
 */
export function describeLimit(read: number, matched: number | undefined, order: IssueOrder = "oldest"): string {
	return `limited to ${read}${matched === undefined ? "" : ` of ${matched}`} (${order} created)`;
}
