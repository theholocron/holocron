/**
 * Bucket 2 of the CI-runner split (holocron#769, holocron#794,
 * `tech-sentinel-ci-runner.spec.md`): a task that needs a real checkout +
 * dependency install (`tsc`, `vitest`, a build) can't run centrally inside
 * Sentinel the way commit-standards/capability-compliance do — it stays on
 * GitHub Actions, but the per-repo *thin-caller file* disappears. Sentinel
 * dispatches ONE canonical workflow living in `theholocron/.github`
 * (`platform.dispatchedCheck.yml`) instead.
 *
 * The two-step mechanism this function performs:
 * 1. Post a `"queued"` check run on the *target* repo — the same repo/SHA
 *    every other Sentinel check attaches to, so it shows up in the PR's
 *    checks list immediately, before the dispatched run has even started.
 * 2. Dispatch `platform.dispatchedCheck.yml` in `theholocron/.github`,
 *    passing the queued check run's own id as an input. `workflow_dispatch`
 *    is fire-and-forget — GitHub returns `204` with no run id — so there's
 *    no synchronous handle to the resulting Actions run here. The dispatched
 *    workflow itself PATCHes this exact check run to `"completed"` once the
 *    task finishes (`checks.updateCheckRun()`, `@theholocron/github-client`
 *    1.28+). The check run id *is* the correlation token between this call
 *    and that eventual PATCH — no separate correlation id needed.
 *
 * Dispatch inputs are plain strings, visible in the Actions UI/logs by
 * design (`workflow_dispatch` has no secret-input concept) — never a
 * credential. The dispatched workflow mints its own short-lived
 * installation token from stored App credentials instead of receiving one
 * here (see the workflow's own comments,
 * `packages/astromech/src/templates/reusable/platform.dispatchedCheck.yml`).
 */

import type { GitHubClient } from "@theholocron/github-client";

import {
	SENTINEL_DISPATCH_REF,
	SENTINEL_DISPATCH_REPO,
	SENTINEL_DISPATCH_WORKFLOW_FILE,
} from "../../utils/constants.js";

export interface DispatchCheckInput {
	client: Pick<GitHubClient, "checks" | "workflows">;
	/** `"owner/repo"` — the repo the task actually runs against, not `theholocron/.github`. */
	repo: string;
	/** The commit SHA the queued check run attaches to. */
	headSha: string;
	/** Ref (branch or SHA) the dispatched workflow checks out — usually the same commit as `headSha`. */
	ref: string;
	/** The `astromech` task name to run, e.g. `"verification.typeSafety"`. */
	task: string;
	/** Check run name, e.g. `"Sentinel / Platform / Typecheck"` — same naming convention as every other Sentinel-posted check. */
	checkName: string;
}

export interface DispatchCheckResult {
	checkRunId: number;
	htmlUrl: string;
}

export async function dispatchCheck(input: DispatchCheckInput): Promise<DispatchCheckResult> {
	const { client, repo, headSha, ref, task, checkName } = input;

	const checkRun = await client.checks.createCheckRun(repo, {
		name: checkName,
		head_sha: headSha,
		status: "queued",
	});

	await client.workflows.createWorkflowDispatch(
		SENTINEL_DISPATCH_REPO,
		SENTINEL_DISPATCH_WORKFLOW_FILE,
		SENTINEL_DISPATCH_REF,
		{
			repo,
			ref,
			task,
			"check-run-id": String(checkRun.id),
		}
	);

	return { checkRunId: checkRun.id, htmlUrl: checkRun.html_url };
}
