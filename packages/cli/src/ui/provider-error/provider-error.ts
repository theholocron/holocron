import { errorMessage } from "@theholocron/misc-utils";

import { ProviderApiError } from "../../plugin/index.js";

/** Vendor response bodies land in the terminal — cap their length so one
 *  oversized error can't flood the report, and strip control characters
 *  (newlines and the C1 range, whose 0x9b is an 8-bit CSI) so a crafted body
 *  can't forge extra report lines or inject terminal escape sequences. */
const MAX_DETAIL_LENGTH = 200;

/** Control characters (newlines and the C1 range included) turned into spaces, whitespace collapsed, no length cap. */
export function stripControl(text: string): string {
	return (
		text
			// eslint-disable-next-line no-control-regex -- deliberately matching control chars (incl. newlines) to strip them
			.replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
			.replace(/\s+/g, " ")
			.trim()
	);
}

export function sanitizeDetail(text: string): string {
	const stripped = stripControl(text);
	return stripped.length > MAX_DETAIL_LENGTH ? `${stripped.slice(0, MAX_DETAIL_LENGTH)}…` : stripped;
}

/**
 * `errorMessage(err)` alone is just `"<Vendor> <METHOD> <path> → <status>"` —
 * the actual reason (what the vendor's response body said) lives in
 * `ProviderApiError.details`, a raw response-body string (not parsed JSON —
 * see AGENTS.md), and was being silently dropped. Appending it (sanitized
 * and length-capped — see `sanitizeDetail`) turns e.g. a bare "→ 403" into
 * something that actually explains itself, without the vendor text being
 * able to overwhelm or manipulate the terminal.
 */
export function describeProviderError(err: unknown): string {
	// A plain Error's message can come from a provider too, so it gets the same treatment as a body.
	const base = stripControl(errorMessage(err));
	if (err instanceof ProviderApiError && err.details) {
		const detail = sanitizeDetail(String(err.details));
		if (detail) return `${base}: ${detail}`;
	}
	return base;
}

/**
 * What to put in structured logs: the plain message of the underlying error,
 * with no response body. The detail {@link describeProviderError} adds is for the
 * person at the terminal; a provider's raw body has no business in telemetry.
 * Wrapper errors carry the original as `cause`, so look through one level.
 */
export function logReason(err: unknown): string {
	const root = err instanceof Error && err.cause !== undefined ? err.cause : err;
	return errorMessage(root);
}
