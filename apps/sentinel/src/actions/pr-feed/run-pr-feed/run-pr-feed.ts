import { errorMessage } from "@theholocron/misc-utils";

import { SENTINEL_PR_FEED_CHECK_NAME } from "../../../utils/constants/index.js";
import { loadPrFeed } from "../load-pr-feed/index.js";
import type { PrFeedPullResult } from "../sync-pull-request/index.js";
import { syncPullRequest } from "../sync-pull-request/index.js";
import type { RunPrFeedInput, RunPrFeedResult } from "./run-pr-feed.type.js";

/** The conclusions of the `ci` aggregate that are a verdict; the others (neutral, skipped, …) say nothing to post. */
const VERDICTS = new Set(["success", "failure", "timed_out", "cancelled"]);

/**
 * The #prs feed for one delivery (holocron#1833, spec `tech-sentinel-pr-feed`): a post in the layout's `feeds.prs`
 * forum for each pull request the delivery is about, kept in step with GitHub. See `syncPullRequest` for what it
 * writes. Off, with a quiet `skipped`, unless `SENTINEL_ROLE_SYNC_REPO` and `HOLOCRON_DISCORD_BOT_TOKEN` are set and the
 * layout has a forum with `feeds.prs`; also `skipped` for an excluded or archived repository. A check run that is not the
 * `ci / Required checks` verdict is dropped before anything is loaded or fetched. Never throws: a provider or network
 * error is a `fail` result, which the handler answers with a 500 (every step is an edit or an idempotent post, so a
 * redelivery is safe) without touching what Sentinel's other actions do.
 */
export async function runPrFeed(input: RunPrFeedInput): Promise<RunPrFeedResult> {
	const { client, repo, trigger } = input;
	try {
		if (trigger.kind === "check_run") {
			if (trigger.check.name !== SENTINEL_PR_FEED_CHECK_NAME) {
				return { status: "skipped", reason: `${trigger.check.name} is not the verdict` };
			}
			if (!trigger.check.conclusion || !VERDICTS.has(trigger.check.conclusion)) {
				return { status: "skipped", reason: `a ${trigger.check.conclusion} conclusion is not a verdict` };
			}
		}
		if (trigger.numbers.length === 0) return { status: "skipped", reason: "no pull request to follow" };

		const loaded = await (input.loadFeed ?? loadPrFeed)({ client, env: input.env, org: repo.split("/")[0]! });
		if (!loaded.ok) return { status: "skipped", reason: loaded.reason };
		const { notifications, channel } = loaded;
		if (channel.excludeRepos.some((r) => r.toLowerCase() === repo.toLowerCase())) {
			return { status: "skipped", reason: `${repo} is excluded` };
		}
		if ((await client.repos.getRepo(repo)).archived) return { status: "skipped", reason: `${repo} is archived` };

		const now = input.now ?? new Date();
		const pulls: PrFeedPullResult[] = [];
		const errors: string[] = [];
		for (const number of trigger.numbers) {
			try {
				pulls.push(await syncPullRequest({ client, notifications, channel, repo, number, trigger, now }));
			} catch (err) {
				errors.push(`${repo}#${number}: ${errorMessage(err)}`);
			}
		}
		return errors.length > 0 ? { status: "fail", reason: errors.join("; ") } : { status: "ok", pulls };
	} catch (err) {
		return { status: "fail", reason: errorMessage(err) };
	}
}
