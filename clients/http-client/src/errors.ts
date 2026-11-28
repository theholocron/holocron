/**
 * Surfaced from every capability call that hits a vendor API. Wraps
 * the underlying error with `status` (HTTP) and `details` so
 * orchestrators can soft-skip rather than abort.
 */
export class ProviderApiError extends Error {
	/** The error name, `ProviderApiError`. */
	override name = "ProviderApiError";
	constructor(
		message: string,
		/** The HTTP status code; `0` for a transport failure that got no response. */
		readonly status: number | undefined,
		/** The raw response body as a string (not parsed JSON); `undefined` when there is none. */
		readonly details?: unknown
	) {
		super(message);
	}
}
