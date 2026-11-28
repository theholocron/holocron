import type { GitHubQuota } from "./github-quota.type.js";

/**
 * What stays for the checks that gate a merge (DCO, commits, config, formatting). Work that only reports (the feed, the
 * board, area labels, the `ci` aggregate) stops below it until the window resets, so a burst of it can never use up the
 * quota the required checks need (the first shadow run did: 5,000 calls in 28 minutes, and no DCO check was posted).
 */
export const QUOTA_RESERVE = 1500;

let last: GitHubQuota | undefined;

/** Remembers the quota a GitHub response reported. A response with no quota headers changes nothing. */
export function recordQuota(remaining: number | undefined, reset: number | undefined): void {
	if (remaining === undefined || reset === undefined || Number.isNaN(remaining) || Number.isNaN(reset)) return;
	last = { remaining, reset };
}

/** The last quota this process saw, or `undefined` before any call or after its window reset. */
export function currentQuota(now: number = Date.now()): GitHubQuota | undefined {
	return last !== undefined && now < last.reset * 1000 ? last : undefined;
}

/**
 * Whether the quota left is below {@link QUOTA_RESERVE}, so only the required checks should run. Best effort: it knows
 * only what this instance's own calls reported, and a fresh instance has seen none.
 */
export function quotaIsLow(now: number = Date.now()): boolean {
	const quota = currentQuota(now);
	return quota !== undefined && quota.remaining < QUOTA_RESERVE;
}

/** Forgets what was recorded. For tests. */
export function resetQuota(): void {
	last = undefined;
}
