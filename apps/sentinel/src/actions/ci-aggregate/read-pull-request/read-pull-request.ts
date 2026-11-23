import type { AggregatePullRequest, ReadPullRequestInput } from "./read-pull-request.type.js";

/** How long an open pull request read is reused. Short, because it only has to cover one burst of check deliveries. */
export const PULL_REQUEST_TTL_MS = 20_000;

const processCache = new Map<string, { at: number; value: AggregatePullRequest }>();

/**
 * Reads a pull request, reusing a read of the last few seconds when the delivery is about the same head commit. A burst
 * of finished checks for one commit all ask for the same pull request; one read serves them. A delivery with no commit,
 * or about a different one (a push moved the head), always reads again, and only an open pull request is kept, so a
 * closed one is never answered from memory.
 */
export async function readPullRequest(input: ReadPullRequestInput): Promise<AggregatePullRequest> {
	const cache = input.cache ?? processCache;
	const now = input.now ?? Date.now();
	const key = `${input.repo}#${input.number}`;
	const hit = cache.get(key);
	if (
		hit !== undefined &&
		input.sha !== undefined &&
		hit.value.head.sha === input.sha &&
		now - hit.at < PULL_REQUEST_TTL_MS
	) {
		return hit.value;
	}
	const value = await input.client.pulls.getPullRequest(input.repo, input.number);
	if (value.state === "open") cache.set(key, { at: now, value });
	else cache.delete(key);
	return value;
}
