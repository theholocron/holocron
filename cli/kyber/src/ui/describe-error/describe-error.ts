import { sanitizeDetail } from "../sanitize-detail/index.js";
import { stripControl } from "../strip-control/index.js";

/**
 * What to print for a caught value: its message with control characters stripped (a provider's text can carry them),
 * and, when the error has a non-empty `details` (the raw response body of an API error, say), that body after it,
 * sanitized and length-capped. A bare "GET /x → 403" then says why, and the vendor's text cannot flood or manipulate the
 * terminal. Anything that is not an `Error` is printed with `String()`.
 */
export function describeError(err: unknown): string {
	const base = stripControl(err instanceof Error ? err.message : String(err));
	const details = err instanceof Error ? (err as { details?: unknown }).details : undefined;
	if (details) {
		const detail = sanitizeDetail(String(details));
		if (detail) return `${base}: ${detail}`;
	}
	return base;
}
