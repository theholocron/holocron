import { onRetry } from "@theholocron/http-client";
import type { ProgressListener } from "@theholocron/kyber/ui";

/** Says on the spinner when a request is being sent again, so a slow step is not mistaken for a stuck one. */
export const retryNotice: ProgressListener = (label, setText) =>
	onRetry((e) => {
		setText(`${label} (retrying ${e.vendor ?? "the request"}, attempt ${e.attempt} of ${e.of})`);
	});
