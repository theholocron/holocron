/**
 * Thrown when Postman returns a `limitReachedError` (e.g., a Free-tier
 * account hitting the "0 APIs" cap).
 */
export class PostmanPlanLimitError extends Error {
	/** The error's name, `"PostmanPlanLimitError"`. */
	override name = "PostmanPlanLimitError";

	constructor(
		/** Postman's message about the plan limit. */
		readonly limitMessage: string,
		/** The raw response body Postman returned. */
		readonly body: string
	) {
		super(limitMessage);
	}
}

/** Returns the message of a `limitReachedError` in a Postman response body, or `null` when the body is not one (or is not JSON). */
export function detectPlanLimit(body: string): string | null {
	try {
		const parsed = JSON.parse(body) as {
			error?: { name?: string; message?: string };
		};
		if (parsed.error?.name === "limitReachedError" && parsed.error.message) {
			return parsed.error.message;
		}
	} catch {
		// Not JSON — fall through.
	}
	return null;
}
