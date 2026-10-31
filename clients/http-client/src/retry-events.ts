/** A request about to be sent again after a transport failure, or an HTTP status the client was told to retry. */
export interface RetryEvent {
	/** The client's `vendor` label, e.g. `GitHub`. */
	vendor?: string;
	/** The HTTP method of the request, such as `GET`. */
	method: string;
	/** The request path, relative to the client's base URL. */
	path: string;
	/**
	 * What went wrong (`ECONNRESET`, `UND_ERR_CONNECT_TIMEOUT`, or `HTTP 503` for a retried status); a failure with no
	 * known cause is never retried.
	 */
	code: string;
	/** The number of the send that is about to happen: 2 for the first retry. */
	attempt: number;
	/** How many sends there can be in all (the retries plus the first). */
	of: number;
	/** How long it waits before sending. */
	delayMs: number;
}

const listeners = new Set<(event: RetryEvent) => void>();

/**
 * Hear about every retry any client in this process is about to make, so a command line can say "retrying GitHub,
 * attempt 2 of 3" instead of sitting silent. Returns the way to stop listening. A listener that throws is ignored: a
 * display problem must not fail a request.
 *
 * This is per process, not per client, so a command need not hand a hook to every client it builds. It relies on there
 * being one copy of this package, which the workspace already requires; with two, retries by the other copy go unseen.
 */
export function onRetry(listener: (event: RetryEvent) => void): () => void {
	listeners.add(listener);
	return () => void listeners.delete(listener);
}

export function notifyRetry(event: RetryEvent): void {
	for (const listener of [...listeners]) {
		try {
			listener(event);
		} catch {
			// a listener's failure is its own
		}
	}
}
