/**
 * Parses an inbound GitHub App webhook delivery and normalizes it into a
 * `SentinelEvent` — the shape the follow-up PR-stack items (custom-
 * properties sync call, check-run posting) will consume. Handler logic
 * only: no HTTP framework, no deploy target assumed — `parseWebhookEvent()`
 * is a plain function over `{ body, headers, secret }` so it slots into
 * Vercel's `Request` (the chosen deploy target — ADR-0011,
 * `docs/wiki/specifications/tech-sentinel-v1.spec.md`) without depending
 * on that choice.
 *
 * Verification and header/payload shapes are `@theholocron/github-client`'s
 * `verifyGitHubWebhookSignature()` / `parseGitHubWebhookHeaders()` /
 * `GitHub*WebhookPayload` — GitHub's own webhook mechanics, the same
 * "this package owns GitHub's raw JSON shapes" role that package already
 * plays for REST responses, not reimplemented per-consumer. What stays
 * here is Sentinel's own concern: which event categories matter in v1,
 * and what a normalized `SentinelEvent` looks like.
 *
 * D10 — org-portable by construction: every identifier (`repo`,
 * `installationId`) comes from the payload itself, never a hardcoded
 * org name, so one App registration handles N installations across N
 * orgs/accounts unchanged.
 *
 * v1 scope only reacts to the three event categories the spec lists —
 * everything else (installation `suspend`, a push to a non-default branch,
 * any other `X-GitHub-Event`) comes back
 * `{ handled: false }` rather than throwing, since an unrecognized-but-
 * validly-signed delivery isn't an error, just not actionable in v1.
 *
 * The #prs feed (holocron#1833) also reads `pull_request` actions the checks do not
 * (`pull_request.feed`: reopened, closed, ready_for_review, converted_to_draft,
 * review_requested, review_request_removed, labeled, and an edit of neither title nor
 * description), `pull_request_review` (submitted, dismissed) and a completed `check_run`
 * named `ci / Required checks` (`check_run.completed`; any other check run is
 * `{ handled: false }` here so a push's dozens of runs cost nothing). Every `pull_request*`
 * event carries `action` and `pullNumbers`, which the opened/synchronize/edited events
 * the checks handle also set; the feed-only types run none of the checks.
 */

import {
	type GitHubInstallationWebhookPayload,
	type GitHubPullRequestWebhookPayload,
	type GitHubPushWebhookPayload,
	parseGitHubWebhookHeaders,
	verifyGitHubWebhookSignature,
} from "@theholocron/github-client";
import { errorMessage } from "@theholocron/misc-utils";

import { SENTINEL_PR_FEED_CHECK_NAME } from "../constants/index.js";
import type {
	GitHubCheckRunWebhookPayload,
	GitHubMembershipWebhookPayload,
	GitHubOrganizationWebhookPayload,
	GitHubPullRequestNumberPayload,
	GitHubPullRequestReviewWebhookPayload,
	ParseWebhookEventInput,
	ParseWebhookResult,
} from "./webhook.type.js";

/** The `pull_request` actions that only the #prs feed reads (the others have a check pipeline of their own). */
const PR_FEED_ACTIONS: ReadonlySet<string> = new Set([
	"reopened",
	"ready_for_review",
	"converted_to_draft",
	"review_requested",
	"review_request_removed",
	"labeled",
	"edited",
	"closed",
]);

export class WebhookVerificationError extends Error {
	override name = "WebhookVerificationError";
}

export function parseWebhookEvent(input: ParseWebhookEventInput): ParseWebhookResult {
	const bodyStr = typeof input.body === "string" ? input.body : input.body.toString("utf8");
	const { event: githubEvent, delivery: deliveryId, signature } = parseGitHubWebhookHeaders(input.headers);

	if (!verifyGitHubWebhookSignature({ body: bodyStr, signature, secret: input.secret })) {
		throw new WebhookVerificationError("X-Hub-Signature-256 verification failed (or missing/empty secret)");
	}
	if (!githubEvent) {
		throw new WebhookVerificationError("Missing X-GitHub-Event header");
	}

	let payload: Record<string, unknown>;
	try {
		payload = JSON.parse(bodyStr) as Record<string, unknown>;
	} catch (err) {
		// JSON.parse always throws a real SyntaxError (an Error instance); errorMessage's
		// non-Error fallback exists for type-safety, not a reachable path.
		/* istanbul ignore next -- JSON.parse never throws a non-Error */
		throw new WebhookVerificationError(`Webhook body is not valid JSON: ${errorMessage(err)}`);
	}

	switch (githubEvent) {
		case "installation": {
			const p = payload as unknown as GitHubInstallationWebhookPayload;
			if (p.action === "created" || p.action === "deleted") {
				return {
					handled: true,
					event: {
						type: p.action === "created" ? "installation.created" : "installation.deleted",
						installationId: p.installation.id,
						...(deliveryId ? { deliveryId } : {}),
						raw: payload,
					},
				};
			}
			return { handled: false, reason: `installation action "${p.action}" is not handled in v1`, githubEvent };
		}
		case "push": {
			const p = payload as unknown as GitHubPushWebhookPayload;
			if (p.ref !== `refs/heads/${p.repository.default_branch}`) {
				return { handled: false, reason: `push to "${p.ref}" is not the default branch`, githubEvent };
			}
			return {
				handled: true,
				event: {
					type: "push.default-branch",
					repo: p.repository.full_name,
					installationId: p.installation?.id ?? 0,
					...(deliveryId ? { deliveryId } : {}),
					raw: payload,
				},
			};
		}
		case "pull_request": {
			const p = payload as unknown as GitHubPullRequestWebhookPayload;
			// An edit only matters when the title or description changed (not the
			// base branch or a draft toggle): the docs-presence check reads a
			// `feat` from the title and `[skip docs]` from the description.
			const { number, pull_request } = payload as GitHubPullRequestNumberPayload;
			const pullNumber = pull_request?.number ?? number;
			const common = {
				repo: p.repository.full_name,
				installationId: p.installation?.id ?? 0,
				action: p.action,
				...(pullNumber === undefined ? {} : { pullNumbers: [pullNumber] }),
				...(deliveryId ? { deliveryId } : {}),
				raw: payload,
			};
			if (p.action === "edited" && (p.changes?.title || p.changes?.body)) {
				return { handled: true, event: { type: "pull_request.edited", ...common } };
			}
			if (p.action === "opened" || p.action === "synchronize") {
				return {
					handled: true,
					event: {
						type: p.action === "opened" ? "pull_request.opened" : "pull_request.synchronize",
						...common,
					},
				};
			}
			// Every other action changes only what the #prs feed shows, so it reaches the feed and no other check.
			if (PR_FEED_ACTIONS.has(p.action) && pullNumber !== undefined) {
				return { handled: true, event: { type: "pull_request.feed", ...common } };
			}
			return {
				handled: false,
				reason: `pull_request action "${p.action}" is not handled in v1`,
				githubEvent,
			};
		}
		case "pull_request_review": {
			const p = payload as unknown as GitHubPullRequestReviewWebhookPayload;
			if (p.action !== "submitted" && p.action !== "dismissed") {
				return {
					handled: false,
					reason: `pull_request_review action "${p.action}" is not handled`,
					githubEvent,
				};
			}
			return {
				handled: true,
				event: {
					type: "pull_request_review",
					repo: p.repository.full_name,
					installationId: p.installation?.id ?? 0,
					action: p.action,
					pullNumbers: [p.pull_request.number],
					...(deliveryId ? { deliveryId } : {}),
					raw: payload,
				},
			};
		}
		case "check_run": {
			// Only the `ci` aggregate's completion is a verdict; a push makes dozens of other check runs, dropped here
			// so they cost no installation token, config read or fetch.
			const p = payload as unknown as GitHubCheckRunWebhookPayload;
			const run = p.check_run;
			if (p.action !== "completed" || run.name !== SENTINEL_PR_FEED_CHECK_NAME) {
				return { handled: false, reason: `check_run "${run.name}" ${p.action} is not handled`, githubEvent };
			}
			return {
				handled: true,
				event: {
					type: "check_run.completed",
					repo: p.repository.full_name,
					installationId: p.installation?.id ?? 0,
					action: p.action,
					pullNumbers: run.pull_requests.map((pr) => pr.number),
					checkRun: {
						name: run.name,
						headSha: run.head_sha,
						conclusion: run.conclusion,
						url: run.html_url,
						...(run.details_url ? { detailsUrl: run.details_url } : {}),
					},
					...(deliveryId ? { deliveryId } : {}),
					raw: payload,
				},
			};
		}
		case "membership": {
			// Someone was added to or removed from a team. Only a team's membership matters here (the event also
			// covers an org's own "scope").
			const p = payload as unknown as GitHubMembershipWebhookPayload;
			if (p.scope !== "team" || (p.action !== "added" && p.action !== "removed")) {
				return { handled: false, reason: `membership ${p.scope} ${p.action} is not handled`, githubEvent };
			}
			return {
				handled: true,
				event: {
					type: "team.membership",
					org: p.organization.login,
					team: p.team.slug,
					installationId: p.installation?.id ?? 0,
					...(deliveryId ? { deliveryId } : {}),
					raw: payload,
				},
			};
		}
		case "organization": {
			// Leaving the org takes a person off every team without a `membership` delivery for each one.
			const p = payload as unknown as GitHubOrganizationWebhookPayload;
			if (p.action !== "member_removed") {
				return { handled: false, reason: `organization action "${p.action}" is not handled`, githubEvent };
			}
			return {
				handled: true,
				event: {
					type: "organization.member-removed",
					org: p.organization.login,
					installationId: p.installation?.id ?? 0,
					...(deliveryId ? { deliveryId } : {}),
					raw: payload,
				},
			};
		}
		default:
			return { handled: false, reason: `"${githubEvent}" is not a v1 event category`, githubEvent };
	}
}
