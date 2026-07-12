/**
 * Surfaced from every capability call that hits a vendor API. Wraps
 * the underlying error with `status` (HTTP) and `details` so
 * orchestrators can soft-skip rather than abort.
 */
export class ProviderApiError extends Error {
	override name = "ProviderApiError";
	constructor(
		message: string,
		readonly status: number | undefined,
		readonly details?: unknown,
	) {
		super(message);
	}
}
