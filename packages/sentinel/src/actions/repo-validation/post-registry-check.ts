/**
 * Posts one check run reflecting `validateRegistry()`'s result
 * (holocron#925). An unregistered package fails the check and posts a PR
 * review via the shared `postErrorReview()`, anchored on its
 * `package.json`'s `"name"` line, the same shape as the ADRs/specs check.
 */

import {
	type CheckRunAnnotation,
	type CheckRunConclusion,
	type GitHubClient,
	MAX_CHECK_RUN_ANNOTATIONS,
} from "@theholocron/github-client";

import { SENTINEL_NAMESPACES, SENTINEL_REGISTRY_LOG_MSG, sentinelAxiomLogUrl } from "../../utils/constants.js";
import { postErrorReview } from "../../utils/post-error-review.js";
import type { CheckedPackage, ValidateRegistryResult } from "./validate-registry.js";

/** Mirrors the CI job's own name (`Repo Validation / Validate registry consistency`) under the `platform` namespace its task lives in. */
export const SENTINEL_REGISTRY_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.platform} / Repo Validation / Validate registry consistency`;

/** The version compared against is in the check's summary, so each finding just names the package. */
function reason(p: CheckedPackage): string {
	return `\`${p.name}\` isn't in @theholocron/registry-doc — add its entry in theholocron/docs and publish it.`;
}

function buildAnnotations(result: ValidateRegistryResult): CheckRunAnnotation[] {
	return result.missing.slice(0, MAX_CHECK_RUN_ANNOTATIONS).map((p) => ({
		path: p.file,
		start_line: p.line,
		end_line: p.line,
		annotation_level: "failure" as const,
		message: reason(p),
		title: "Not in the package registry",
	}));
}

export interface PostRegistryCheckInput {
	client: Pick<GitHubClient, "checks" | "pulls">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: ValidateRegistryResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in `output.text` so a viewer can find the request in Axiom. */
	runId: string;
}

export interface PostRegistryCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}

export async function postRegistryCheck(input: PostRegistryCheckInput): Promise<PostRegistryCheckResult> {
	const { client, repo, pullNumber, headSha, result, runId } = input;
	const conclusion: CheckRunConclusion = result.valid ? "success" : "failure";
	const against = result.registryVersion ? ` (@theholocron/registry-doc@${result.registryVersion})` : "";

	const title = result.valid ? "Registry: OK" : `Registry: ${result.missing.length} package(s) not registered`;
	const summary =
		result.checked.length === 0
			? "This PR changes no public package's package.json — nothing to check."
			: result.valid
				? `All ${result.checked.length} public package(s) this PR touches are registered${against}.`
				: `${result.missing.length} of ${result.checked.length} public package(s) this PR touches aren't registered${against}.`;
	const text = [
		result.valid ? undefined : result.missing.map((p) => `${p.file}:${p.line}: ${p.name}`).join("\n"),
		`Run ID: \`${runId}\``,
	]
		.filter((line) => line !== undefined)
		.join("\n\n");

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_REGISTRY_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: { title, summary, text, annotations: buildAnnotations(result) },
		details_url: sentinelAxiomLogUrl(runId, SENTINEL_REGISTRY_LOG_MSG),
	});

	await postErrorReview({
		client,
		repo,
		pullNumber,
		headSha,
		checkKey: "registry",
		checkLabel: "Registry consistency",
		checkRunName: SENTINEL_REGISTRY_CHECK_RUN_NAME,
		errors: result.missing.map((p) => ({ file: p.file, line: p.line, body: reason(p) })),
		warningCount: 0,
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
