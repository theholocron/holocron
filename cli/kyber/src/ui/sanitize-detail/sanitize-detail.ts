import { stripControl } from "../strip-control/index.js";

/** The longest a detail is kept, so one oversized body cannot flood a report. */
const MAX_DETAIL_LENGTH = 200;

/**
 * {@link stripControl}, then cut to 200 characters with an ellipsis. For a vendor's response body or any other text of
 * unknown size that lands in the terminal.
 */
export function sanitizeDetail(text: string): string {
	const stripped = stripControl(text);
	return stripped.length > MAX_DETAIL_LENGTH ? `${stripped.slice(0, MAX_DETAIL_LENGTH)}…` : stripped;
}
