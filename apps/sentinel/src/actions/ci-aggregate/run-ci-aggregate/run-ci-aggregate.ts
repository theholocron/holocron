import { postAggregate } from "@theholocron/astromech";
import { errorMessage } from "@theholocron/misc-utils";

import { SENTINEL_CI_AGGREGATE_SHADOW_NAME, SENTINEL_PR_FEED_CHECK_NAME } from "../../../utils/constants/index.js";
import { ciAggregateMode } from "../ci-aggregate-mode/index.js";
import { githubAggregateApi } from "../github-aggregate-api/index.js";
import { readAggregateChecks } from "../read-aggregate-checks/index.js";
import { readAggregatePoster } from "../read-aggregate-poster/index.js";
import type { CiAggregatePosted, RunCiAggregateInput, RunCiAggregateResult } from "./run-ci-aggregate.type.js";

/** Whether a finished check run or a changed status is one the aggregate waits for. */
function isWaitedOn(
	kind: "check_run" | "status",
	name: string | undefined,
	checks: { expected: string[]; statuses: string[] }
): boolean {
	if (name === undefined) return false;
	if (checks.statuses.includes(name)) return true;
	return kind === "check_run" && checks.expected.some((id) => name.startsWith(`${id} / `));
}

/**
 * Computes the `ci` aggregate for the pull requests a delivery is about and posts it (SPEC-0099, phases 3 and 8).
 * Everything is read from the API, never the payload: the pull request (open, and the commit still its head), the
 * config at its base branch for `expected`, and the commit's check runs and statuses. A finished check run or a changed
 * status that the aggregate does not wait for is dropped after one config read, which a warm instance caches. A
 * pull request that fails does not stop the others; any failure is the result's `fail`. Never throws.
 *
 * It does nothing unless `SENTINEL_CI_AGGREGATE` is `shadow` or `on`, so deploying it changes no deployment until a
 * person sets it. In `shadow` it posts `ci / Required checks (sentinel)`. In `on` it posts the real `ci / Required
 * checks` for a pull request whose **head** says `ci.aggregate: sentinel` and the shadow for every other, so a commit
 * has exactly one poster of the real check; a commit where the Actions job already posts it is left alone (`foreign`).
 */
export async function runCiAggregate(input: RunCiAggregateInput): Promise<RunCiAggregateResult> {
	const mode = ciAggregateMode(input.env);
	if (mode === "off") return { status: "skipped", reason: "SENTINEL_CI_AGGREGATE is not shadow or on" };
	const { client, repo, trigger } = input;
	const now = input.now ?? Date.now();
	const posted: CiAggregatePosted[] = [];
	const skipped: Array<{ number: number; reason: string }> = [];
	const failures: string[] = [];

	try {
		let targets = trigger.pullRequests.map((pr) => pr.number);
		if (trigger.kind === "status") {
			// A status names a commit and its branches, not a pull request.
			const found = await Promise.all(
				trigger.branches.map((branch) => client.pulls.listOpenByHead(repo, branch))
			);
			targets = [
				...new Set(
					found
						.flat()
						.filter((pr) => pr.head.sha === trigger.sha)
						.map((pr) => pr.number)
				),
			];
		}
		if (targets.length === 0) return { status: "skipped", reason: "no open pull request for this delivery" };

		for (const number of [...new Set(targets)]) {
			try {
				const pr = await client.pulls.getPullRequest(repo, number);
				if (pr.state !== "open") {
					skipped.push({ number, reason: "closed" });
					continue;
				}
				if (trigger.sha !== undefined && trigger.sha !== pr.head.sha) {
					skipped.push({ number, reason: "not the head commit any more" });
					continue;
				}
				const baseRef = pr.base?.ref;
				if (baseRef === undefined) {
					skipped.push({ number, reason: "the pull request names no base branch" });
					continue;
				}
				const checks = await readAggregateChecks({ client, repo, baseRef, now });
				if (!checks.ok) {
					skipped.push({ number, reason: checks.reason });
					continue;
				}
				if (
					(trigger.kind === "check_run" || trigger.kind === "status") &&
					!isWaitedOn(trigger.kind, trigger.name, checks)
				) {
					skipped.push({ number, reason: "not a check the aggregate waits for" });
					continue;
				}
				// One poster per commit: the real check where the head's own config says Sentinel posts it (and only in `on`
				// mode), the shadow everywhere else.
				const poster =
					mode === "on"
						? (await readAggregatePoster({ client, repo, sha: pr.head.sha, now })).poster
						: "actions";
				const name =
					input.name ??
					(poster === "sentinel" ? SENTINEL_PR_FEED_CHECK_NAME : SENTINEL_CI_AGGREGATE_SHADOW_NAME);
				const out = await postAggregate({
					api: githubAggregateApi(client, repo),
					sha: pr.head.sha,
					expected: checks.expected,
					statuses: checks.statuses,
					now,
					name,
					refreshOutput: true,
				});
				if (out.action === "foreign") {
					skipped.push({ number, reason: "another app already posts this check on the commit" });
					continue;
				}
				posted.push({
					number,
					action: out.action,
					conclusion: out.result.conclusion,
					sha: pr.head.sha,
					runId: out.runId,
					real: name === SENTINEL_PR_FEED_CHECK_NAME,
				});
			} catch (err) {
				failures.push(`#${number}: ${errorMessage(err)}`);
			}
		}
	} catch (err) {
		return { status: "fail", reason: errorMessage(err) };
	}
	return failures.length > 0 ? { status: "fail", reason: failures.join("; ") } : { status: "ok", posted, skipped };
}
