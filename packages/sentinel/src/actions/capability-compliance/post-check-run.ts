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
 * `SENTINEL_CHECK_RUN_NAME` folds under the `platform` namespace
 * (`SENTINEL_NAMESPACES`) even though this check has no `platform.*` task or
 * workflow behind it at all — Sentinel posts it directly via the Checks API
 * from a webhook. No "Sentinel /" prefix: GitHub's own check-run detail
 * page already shows the posting App's display name ahead of whatever name
 * is set here, so a hand-added prefix just duplicated it. Exported so a
 * caller checking for this check run by name (a future re-run guard, a
 * test, a dashboard) never hand-copies the string.
 */

import { missingCapabilities } from "@theholocron/cli";
import type { CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import { SENTINEL_AXIOM_DATASET_URL, SENTINEL_NAMESPACES } from "../../utils/constants.js";

export const SENTINEL_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.platform} / Capability Compliance`;

export interface PostCheckRunInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a push event's `after` field, or a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	/** From `syncPropertiesFromConfig()`'s result's `holocron_capabilities`, or independently resolved. */
	capabilities: readonly string[];
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostCheckRunResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}

export async function postCheckRun(input: PostCheckRunInput): Promise<PostCheckRunResult> {
	const { client, repo, headSha, capabilities, runId } = input;
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

	// `text` renders as a collapsible "Show more" section on the check
	// run's own GitHub page — real native detail beyond the one-line
	// `summary`, no external click required. `details_url` still points
	// at Axiom for the underlying structured log line (timings, raw
	// error, etc.) that's overkill to reproduce here.
	const text = [
		`**Declared capabilities (${capabilities.length}):** ${capabilities.length > 0 ? capabilities.join(", ") : "(none)"}`,
		missing.length === 0 ? "**Required baseline:** all present." : `**Missing required:** ${missing.join(", ")}`,
		`Run ID: \`${runId}\``,
	].join("\n\n");

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: { title, summary, text },
		details_url: SENTINEL_AXIOM_DATASET_URL,
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
