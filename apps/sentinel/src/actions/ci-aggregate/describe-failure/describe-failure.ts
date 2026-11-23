import { errorMessage } from "@theholocron/misc-utils";

/** How much of GitHub's own answer a failure row keeps. */
export const FAILURE_DETAIL_CHARS = 160;

/**
 * An error as one line for a failure row: its message, then the start of the response text the provider sent
 * (`ProviderApiError.details`, a raw string), so a 403 says whether GitHub meant a rate limit or a missing permission.
 * Control characters are dropped and the detail is cut, so a long body cannot flood the log.
 */
export function describeFailure(err: unknown): string {
	const message = errorMessage(err);
	const details = typeof err === "object" && err !== null ? (err as { details?: unknown }).details : undefined;
	if (typeof details !== "string") return message;
	// Any run of whitespace or control characters (a newline in a JSON body, an escape code) becomes one space.
	const flat = [...details]
		.map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? " " : ch))
		.join("")
		.replace(/\s+/g, " ")
		.trim();
	if (flat === "") return message;
	const cut = flat.length > FAILURE_DETAIL_CHARS ? `${flat.slice(0, FAILURE_DETAIL_CHARS)}…` : flat;
	return `${message} (${cut})`;
}
