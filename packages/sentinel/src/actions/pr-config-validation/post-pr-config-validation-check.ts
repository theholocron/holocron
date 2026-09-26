/**
 * Posts one check run reflecting `validateConfig()`'s result against a
 * PR's *own* branch (holocron#827, a follow-up to the `ref`-aware
 * `validateConfig()` built for auto-fix-commit, holocron#820) — advisory,
 * never required, deliberately separate from the existing Capability
 * Compliance check.
 *
 * Why separate: Capability Compliance is already a required status check
 * in this org's repos. Changing its own validation source to the PR
 * branch means deciding what happens when that read fails (a WIP/broken
 * config mid-edit) for a check merging depends on — this check sidesteps
 * that by being advisory, same rollout shape Inclusive Language and
 * Formatting used before either was ever made required. Capability
 * Compliance itself, and the properties it derives, stay on the
 * default-branch call, unchanged — a capability a PR merely proposes
 * isn't operational yet (no secrets wired, no `holocron setup`/`sync` run
 * against it).
 */

import type { CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import {
	SENTINEL_NAMESPACES,
	SENTINEL_PR_CONFIG_VALIDATION_LOG_MSG,
	sentinelAxiomLogUrl,
} from "../../utils/constants.js";
import type { ValidateConfigResult } from "../../utils/validate-config.js";

// "(pull_request)" suffix, not a distinct name -- this is the same
// Capability Compliance concept, just validated against the PR's own
// branch instead of the default branch (see the module docstring for
// why that's a separate check rather than a change to the existing one).
export const SENTINEL_PR_CONFIG_VALIDATION_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.platform} / Capability Compliance (pull_request)`;

export interface PostPrConfigValidationCheckInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	/** `validateConfig()`'s result against the PR's own head ref, not the default branch. */
	result: ValidateConfigResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostPrConfigValidationCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}

/**
 * `"no-config"` is `success`, same as the "no-config is fine" stance
 * `validateConfig()`'s own existing callers already take — a repo without
 * `holocron.config.ts` isn't broken, it's just not participating.
 * `"unknown-tasks"`/`"load-error"` are genuine mistakes in this PR's own
 * proposed change, so `failure` — same distinction Commit Standards
 * already draws between a real violation and nothing to flag.
 */
function conclusionFor(result: ValidateConfigResult): CheckRunConclusion {
	return result.status === "unknown-tasks" || result.status === "load-error" ? "failure" : "success";
}

function titleAndSummary(result: ValidateConfigResult): { title: string; summary: string } {
	switch (result.status) {
		case "valid":
			return { title: "PR config: OK", summary: `${result.filepath} on this PR's own branch is valid.` };
		case "no-config":
			return {
				title: "PR config: OK (no holocron.config.*)",
				summary: "No holocron.config.* found on this PR's own branch — nothing to validate.",
			};
		case "unknown-tasks":
			return {
				title: `PR config: ${result.unknownTasks.length} unknown task(s)`,
				summary: `${result.filepath} declares task(s) outside the registry: ${result.unknownTasks.join(", ")}.`,
			};
		case "load-error":
			return {
				title: "PR config: failed to load",
				summary: `${result.filepath} couldn't be parsed/executed: ${result.message}`,
			};
	}
}

export async function postPrConfigValidationCheck(
	input: PostPrConfigValidationCheckInput
): Promise<PostPrConfigValidationCheckResult> {
	const { client, repo, headSha, result, runId } = input;
	const conclusion = conclusionFor(result);
	const { title, summary } = titleAndSummary(result);

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_PR_CONFIG_VALIDATION_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: { title, summary, text: `Run ID: \`${runId}\`` },
		details_url: sentinelAxiomLogUrl(runId, SENTINEL_PR_CONFIG_VALIDATION_LOG_MSG),
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
