import type { ProgressListener } from "../progress/index.js";
import type { RetrySubscribe } from "./retry-notice.type.js";

/**
 * Builds a {@link ProgressListener} that says on the spinner when a request is being sent again, so a slow step is
 * not mistaken for a stuck one. `subscribe` is the HTTP client's retry hook (e.g. `onRetry`), which keeps kyber free
 * of any client dependency.
 */
export function createRetryNotice(subscribe: RetrySubscribe): ProgressListener {
	return (label, setText) =>
		subscribe((e) => {
			setText(`${label} (retrying ${e.vendor ?? "the request"}, attempt ${e.attempt} of ${e.of})`);
		});
}
