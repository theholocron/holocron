/**
 * Posts one check run reflecting capability-compliance status — the App's
 * v1 report: "this repo declares X, Y, Z — all present" or "missing:
 * dependencyReview" (the exact examples the epic spec's Scope section
 * gives). Calls `@theholocron/github-client`'s `checks.createCheckRun()`
 * directly — Sentinel isn't a plugin, and this is a single REST call with
 * nothing else to wrap.
 *
 * D8: "compliant" reduces to `missingCapabilities(capabilities).length === 0`
 * — the same `REQUIRED_BASELINE` table `@theholocron/cli`'s
 * `deriveCompliance()` (called by `syncPropertiesFromConfig()`) already
 * checks against, imported rather than duplicated, so *why* a repo is
 * non-compliant can never drift from *whether* it is.
 *
 * `SENTINEL_CHECK_RUN_NAME` stays a human-readable "App / Report" label
 * (`CodeQL`, `Devin Review` are the closest precedent — externally-posted
 * checks, not `.github/workflows/*.yml` runs) rather than a
 * `platform.*`-style intent-vocabulary token: the vocabulary (epic #672,
 * D3) names `tasks:` entries backed by a reusable CI workflow, and this
 * check has no workflow behind it at all — Sentinel posts it directly via
 * the Checks API from a webhook. Exported so a caller checking for this
 * check run by name (a future re-run guard, a test, a dashboard) never
 * hand-copies the string.
 */

import { missingCapabilities } from "@theholocron/cli";
import type { CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

export const SENTINEL_CHECK_RUN_NAME = "Sentinel / Capability Compliance";

export interface PostCheckRunInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a push event's `after` field, or a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	/** From `syncPropertiesFromConfig()`'s result's `holocron_capabilities`, or independently resolved. */
	capabilities: readonly string[];
}

export interface PostCheckRunResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}

export async function postCheckRun(input: PostCheckRunInput): Promise<PostCheckRunResult> {
	const { client, repo, headSha, capabilities } = input;
	const missing = missingCapabilities(capabilities);
	const conclusion: CheckRunConclusion = missing.length === 0 ? "success" : "failure";

	const title =
		missing.length === 0 ? "Capability compliance: OK" : "Capability compliance: missing required capabilities";
	const summary =
		missing.length === 0
			? // The "no" fallback is defensive, not reachable today: compliant
				// means every REQUIRED_BASELINE entry is present, and that baseline
				// is non-empty, so capabilities can't be empty here — kept in case
				// REQUIRED_BASELINE itself is ever emptied.
				/* istanbul ignore next -- see comment above */
				`This repo declares ${capabilities.length > 0 ? capabilities.join(", ") : "no"} capabilities — all required capabilities present.`
			: `Missing: ${missing.join(", ")}.`;

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: { title, summary },
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
