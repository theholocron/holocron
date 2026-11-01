/**
 * Posts one check run reflecting `validateDocsPresence()`'s result
 * (holocron#913). Advisory only, like the probe it shares its rules with
 * (`holocron probe docs presence`, holocron#929): `success` when the PR adds
 * no public package without docs and no `feat` leaves a package undocumented,
 * `neutral` with one `notice` annotation per finding otherwise — never `failure`, and no
 * PR review (there's nothing wrong with a specific line to comment on).
 */

import type { CheckRunConclusion } from "@theholocron/github-client";

import { SENTINEL_DOCS_PRESENCE_LOG_MSG, SENTINEL_NAMESPACES, sentinelAxiomLogUrl } from "../../../utils/index.js";
import type { PostDocsPresenceCheckInput, PostDocsPresenceCheckResult } from "./post-docs-presence-check.type.js";

/** Mirrors the CI job's own name (`Repo Validation / Validate docs presence`) under the `platform` namespace its task lives in. */
export const SENTINEL_DOCS_PRESENCE_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.platform} / Repo Validation / Validate docs presence`;

const GUIDANCE =
	"Add a docs page under docs/ in this PR, or open a scoped follow-up PR immediately after — docs should ship with the feature.";

const SKIP_HINT =
	"Update its README, its docs page or a doc comment in the same PR, or add `[skip docs] <reason>` to the PR description.";

const FEAT_GUIDANCE = (dirs: string): string => `This feat changes the source of ${dirs} without a docs change.`;

export async function postDocsPresenceCheck(input: PostDocsPresenceCheckInput): Promise<PostDocsPresenceCheckResult> {
	const { client, repo, headSha, result, runId } = input;
	const names = result.newPackages.map((p) => p.name).join(", ");
	const missingPackageDocs = result.newPackages.length > 0 && !result.hasDocsChange;
	const warnedDirs = result.featWarnings.map((w) => w.dir).join(", ");

	const conclusion: CheckRunConclusion = result.valid ? "success" : "neutral";
	const problems = [
		...(missingPackageDocs ? [`${result.newPackages.length} new package(s) without a docs change`] : []),
		...(result.featWarnings.length > 0 ? [`${result.featWarnings.length} feat package(s) without docs`] : []),
	];
	const title = result.valid ? "Docs presence: OK" : `Docs presence: ${problems.join(", ")}`;
	const summary = [
		result.newPackages.length === 0
			? "No new public packages."
			: missingPackageDocs
				? `New public package(s) ${names} added without any change under docs/ or to a .md/.mdx file. ${GUIDANCE}`
				: `New public package(s) ${names} come with a docs change.`,
		...(result.featWarnings.length > 0 ? [`${FEAT_GUIDANCE(warnedDirs)} ${SKIP_HINT}`] : []),
		...result.skipped.map((s) => `${s.dir}: excused by [skip docs] ${s.reason}.`),
		...(result.missingReason
			? ["A [skip docs] marker was found, but it has no reason after it, so it does not count."]
			: []),
	].join("\n\n");

	const annotations = [
		...(missingPackageDocs
			? result.newPackages.map((p) => ({
					path: p.entry,
					start_line: 1,
					end_line: 1,
					annotation_level: "notice" as const,
					message: `New public package "${p.name}" has no docs change in this PR. ${GUIDANCE}`,
					title: "docs-presence",
				}))
			: []),
		...result.featWarnings.map((w) => ({
			path: w.path,
			start_line: 1,
			end_line: 1,
			annotation_level: "notice" as const,
			message: `This feat changes "${w.dir}" without a docs change. ${SKIP_HINT}`,
			title: "docs-presence",
		})),
	];

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_DOCS_PRESENCE_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: {
			title,
			summary,
			text: `Run ID: \`${runId}\``,
			annotations,
		},
		details_url: sentinelAxiomLogUrl(runId, SENTINEL_DOCS_PRESENCE_LOG_MSG),
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
