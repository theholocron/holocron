/**
 * Posts one check run reflecting `validateDocsPresence()`'s result
 * (holocron#913). Advisory only, like the script it ports: `success` when
 * the PR adds no public package or also changes docs, `neutral` with one
 * `notice` annotation per new package otherwise — never `failure`, and no
 * PR review (there's nothing wrong with a specific line to comment on).
 */

import type { CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import { SENTINEL_DOCS_PRESENCE_LOG_MSG, SENTINEL_NAMESPACES, sentinelAxiomLogUrl } from "../../utils/constants.js";
import type { ValidateDocsPresenceResult } from "./validate-docs-presence.js";

/** Mirrors the CI job's own name (`Repo Validation / Validate docs presence`) under the `platform` namespace its task lives in. */
export const SENTINEL_DOCS_PRESENCE_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.platform} / Repo Validation / Validate docs presence`;

const GUIDANCE =
	"Add a docs page under docs/ in this PR, or open a scoped follow-up PR immediately after — docs should ship with the feature.";

export interface PostDocsPresenceCheckInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: ValidateDocsPresenceResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in `output.text` so a viewer can find the request in Axiom. */
	runId: string;
}

export interface PostDocsPresenceCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}

export async function postDocsPresenceCheck(input: PostDocsPresenceCheckInput): Promise<PostDocsPresenceCheckResult> {
	const { client, repo, headSha, result, runId } = input;
	const names = result.newPackages.map((p) => p.name).join(", ");

	const conclusion: CheckRunConclusion = result.valid ? "success" : "neutral";
	const title = result.valid
		? "Docs presence: OK"
		: `Docs presence: ${result.newPackages.length} new package(s) without a docs change`;
	const summary =
		result.newPackages.length === 0
			? "No new public packages."
			: result.valid
				? `New public package(s) ${names} come with a docs change.`
				: `New public package(s) ${names} added without any change under docs/ or to a .md/.mdx file. ${GUIDANCE}`;

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_DOCS_PRESENCE_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: {
			title,
			summary,
			text: `Run ID: \`${runId}\``,
			annotations: result.valid
				? []
				: result.newPackages.map((p) => ({
						path: p.entry,
						start_line: 1,
						end_line: 1,
						annotation_level: "notice" as const,
						message: `New public package "${p.name}" has no docs change in this PR. ${GUIDANCE}`,
						title: "docs-presence",
					})),
		},
		details_url: sentinelAxiomLogUrl(runId, SENTINEL_DOCS_PRESENCE_LOG_MSG),
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
