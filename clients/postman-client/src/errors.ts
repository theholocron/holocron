/**
 * Thrown when Postman returns a `limitReachedError` (e.g., a Free-tier
 * account hitting the "0 APIs" cap).
 */
export class PostmanPlanLimitError extends Error {
	override name = "PostmanPlanLimitError";

	constructor(
		readonly limitMessage: string,
		readonly body: string,
	) {
		super(limitMessage);
	}
}

export function detectPlanLimit(body: string): string | null {
	try {
		const parsed = JSON.parse(body) as {
			error?: { name?: string; message?: string };
		};
		if (
			parsed.error?.name === "limitReachedError" &&
			parsed.error.message
		) {
			return parsed.error.message;
		}
	} catch {
		// Not JSON — fall through.
	}
	return null;
}
