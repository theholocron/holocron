import { onRetry } from "@theholocron/http-client";
import {
	createProgress as createSpinnerProgress,
	type Progress,
	progressEnabled,
	type ProgressListener,
	withProgress as withSpinnerProgress,
} from "@theholocron/kyber/ui";

/** Says on the spinner when a request is being sent again, so a slow step is not mistaken for a stuck one. */
export const retryNotice: ProgressListener = (label, setText) =>
	onRetry((e) => {
		setText(`${label} (retrying ${e.vendor ?? "the request"}, attempt ${e.attempt} of ${e.of})`);
	});

/** {@link createSpinnerProgress} with the retry notice hooked in. */
export function createProgress(print: (line: string) => void, enabled: () => boolean = progressEnabled): Progress {
	return createSpinnerProgress(print, enabled, retryNotice);
}

/** `fn` under a cleared-when-done spinner named `label`, on a terminal only, with the retry notice hooked in. */
export function withProgress<T>(label: string, fn: () => Promise<T>): Promise<T> {
	return withSpinnerProgress(label, fn, retryNotice);
}
