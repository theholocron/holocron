import { describeError } from "@theholocron/kyber/ui";

/** The text of a JSON body's `message` or `error` field, or of an `error` object's own `message`. */
function jsonMessage(body: unknown): string | undefined {
	if (typeof body !== "object" || body === null) return undefined;
	const { message, error } = body as { message?: unknown; error?: unknown };
	if (typeof message === "string" && message) return message;
	if (typeof error === "string" && error) return error;
	return jsonMessage(error);
}

/** What the provider said in a response body: the JSON `message` or `error` field, else the text as it came. */
export function providerMessage(details: unknown): string | undefined {
	if (details === undefined || details === null || details === "") return undefined;
	const text = typeof details === "string" ? details : JSON.stringify(details);
	try {
		return jsonMessage(JSON.parse(text)) ?? text;
	} catch {
		return text;
	}
}

/**
 * {@link describeError} for a setup row, with the provider's own message in place of its whole response body: a JSON
 * `message` or `error` field when the body has one, else the first part of the text. One line, control characters
 * gone and cut to a fixed length, as `describeError` does.
 */
export function describeProviderError(err: unknown): string {
	const details = err instanceof Error ? (err as { details?: unknown }).details : undefined;
	const said = providerMessage(details);
	if (said === undefined || !(err instanceof Error)) return describeError(err);
	return describeError(Object.assign(new Error(err.message), { details: said }));
}
