import { AGGREGATE_CHECK_NAME } from "@theholocron/astromech";

import type { PullRequest, Source } from "../../plugin/index.js";
import { SHADOW_DEFAULT_LIMIT, type ShadowSample } from "./shadow.type.js";
import { shadowVerdict } from "./shadow-verdict.js";

/** The name Sentinel's shadow posts under; the same string as Sentinel's `SENTINEL_CI_AGGREGATE_SHADOW_NAME`. */
export const SHADOW_CHECK_NAME = `${AGGREGATE_CHECK_NAME} (sentinel)`;

/**
 * The two aggregate verdicts of the newest pull requests, newest first: the open ones and the merged ones (a pull
 * request closed without merging has no verdict worth comparing), at most `limit` of them. Each is read from the check
 * runs of the pull request's head commit through the `source` provider.
 */
export async function readShadowSamples(
	source: Required<Pick<Source, "listPullRequests" | "listCheckRuns">>,
	limit: number = SHADOW_DEFAULT_LIMIT
): Promise<ShadowSample[]> {
	const [open, closed] = await Promise.all([source.listPullRequests("open"), source.listPullRequests("closed")]);
	const newest: PullRequest[] = [...open, ...closed.filter((pr) => pr.merged)]
		.filter((pr) => pr.headSha !== undefined)
		.sort((a, b) => b.number - a.number)
		.slice(0, limit);
	const samples: ShadowSample[] = [];
	for (const pr of newest) {
		const runs = await source.listCheckRuns(pr.headSha as string);
		const actions = shadowVerdict(runs, AGGREGATE_CHECK_NAME);
		const sentinel = shadowVerdict(runs, SHADOW_CHECK_NAME);
		samples.push({
			number: pr.number,
			...(actions === undefined ? {} : { actions }),
			...(sentinel === undefined ? {} : { sentinel }),
		});
	}
	return samples;
}
