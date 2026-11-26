/** What the last GitHub call in this process said about the installation's hourly quota. */
export interface GitHubQuota {
	/** Calls left in the window, from `x-ratelimit-remaining`. */
	remaining: number;
	/** When the window resets, in epoch seconds, from `x-ratelimit-reset`. */
	reset: number;
}
