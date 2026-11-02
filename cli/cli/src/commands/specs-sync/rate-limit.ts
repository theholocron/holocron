import { ProviderApiError } from "../../plugin/index.js";

/**
 * How many seconds a provider asks to be left alone for, when `err` is a rate limit it would not wait out (a 429); `0`
 * when it says a rate limit but not for how long; `undefined` for any other error. Discord answers with the time in the
 * body (`retry_after`), and the client has already waited for the short ones.
 */
export function rateLimitedFor(err: unknown): number | undefined {
	if (!(err instanceof ProviderApiError) || err.status !== 429) return undefined;
	const seconds = /"retry_after":\s*([\d.]+)/.exec(String(err.details))?.[1];
	return seconds === undefined ? 0 : Math.ceil(Number(seconds));
}
