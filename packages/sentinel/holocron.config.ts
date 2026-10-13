/**
 * Sentinel's own deploy config — separate from this monorepo's root
 * `holocron.config.ts` (which governs `holocron`'s own CI/build), since
 * Sentinel is deployed as its own product, not built/released the way
 * the CLI or the plugins are. Not part of the recurring `holocron run ci`
 * gate (no `source` provider — Sentinel has no repo-settings surface
 * of its own to check).
 *
 * Three separate invocations, different frequency:
 *   - `pnpm run delivery.deploy` (recurring, every real deploy):
 *     build → stage → `holocron deploy --target production`.
 *   - `holocron repo setup --cwd packages/sentinel` (one-time, manual):
 *     attaches the custom domain to the Vercel project and hands any
 *     verification CNAME to the `dns` provider — `source` being
 *     unconfigured just means every repo-settings step is skipped
 *     (each gated on `loader.has("source")`), not that setup fails.
 *   - `delivery.previewCheck` (holocron#1010, per PR): triggered by
 *     Vercel's own `deployment_status` event on a successful Preview
 *     deploy, runs `holocron monitoring check` against that PR's own
 *     preview URL instead of production — see the `monitoring` provider
 *     comment below for why this exists.
 *
 * `deployment`: Vercel, a Team separate from any other Vercel project
 * in this org (ADR-0011's deploy-target decision). `teamId` is not a
 * credential — same non-secret-identifier status as Cloudflare's
 * `accountId` elsewhere in this org — safe to commit directly.
 *
 * `vault`: Doppler (holocron#781) — `project: "sentinel"`, `config:
 * "prd"`, confirmed against the real Doppler project. All 5 runtime
 * secrets live there; `holocron secrets sync` fans them out.
 *
 * `secrets`: GitHub — only ONE of the 5 Doppler keys has a GH Actions
 * consumer at all (`SENTINEL_AXIOM_INGEST_TOKEN`, read by
 * `theholocron/.github`'s `platform.dispatchedCheck.yml`, org-wide since
 * any repo with Bucket 2 dispatch enabled needs it there, not just this
 * one) — every sync invocation must pass `--github-secret
 * SENTINEL_AXIOM_INGEST_TOKEN --github-secret-scope org=theholocron` to
 * scope it down to that one key; the other 4 are Vercel-only and would
 * otherwise get pushed as pointless repo secrets on `holocron` (nothing
 * in this repo's own CI reads them).
 *
 * `dns`: Cloudflare — receives the CNAME challenge `holocron repo setup`
 * gets back from `Deployment.ensureCustomDomain()` when it adds
 * `sentinel.theholocron.dev` to the Vercel project, via
 * `Dns.upsertRecord()`.
 *
 * `monitoring`: Checkly (holocron#996) — two API checks watching
 * `sentinel.theholocron.dev/api/webhook` from outside Vercel's own
 * infra, since Sentry/Axiom are both reactive (they only see traffic
 * that reaches the function) and wouldn't notice if the deployment
 * stopped receiving traffic at all. `accountId` is not a secret (same
 * status as Vercel's `teamId`); the API token is Doppler-sourced like
 * every other secret here, fanned out to `HOLOCRON_CHECKLY_TOKEN` by
 * `holocron secrets sync` the same way `vault` already handles the
 * other 5 keys. `locations: ["us-east-1"]` is required on both —
 * confirmed live via `POST /checks/api` returning 400 "You have to
 * set at least one `location` or `privateLocation`" on this (trial)
 * account, which has no account-level default configured.
 *
 * The uptime check asserts a 405 on a plain GET: confirmed live that
 * `handleWebhookRequest` rejects non-POST before touching any
 * webhook-specific logic, so a clean 405 with the exact expected body
 * proves the function is deployed and routing correctly, not
 * crashed/cold/timed out — full business-logic correctness stays
 * with the existing test suite. `shouldFail: true` is required on
 * both checks below — confirmed live that a check still reports
 * `hasFailures: true` with the assertion matching exactly (`actual:
 * 405` === `target: "405"`, no assertion-level error): Checkly
 * classifies any response >= 400 as a platform-level failure before
 * assertions are evaluated at all, and `shouldFail` is the documented
 * flag to invert that for a check whose healthy response is itself an
 * error status.
 *
 * The second check POSTs an empty body with no signature header at
 * all and asserts a 401 — `handler.ts`'s `parseWebhookEvent()` throws
 * `WebhookVerificationError` (mapped to 401) the moment
 * `verifyGitHubWebhookSignature()` fails, which it always does given
 * no `X-Hub-Signature-256` header. Unlike the uptime check, this one
 * actually proves `SENTINEL_WEBHOOK_SECRET` made it into the deployed
 * environment correctly: the uptime check's 405 fires before signature
 * verification ever runs, so it can't catch a secret drifting out of
 * sync between Doppler and Vercel — this one can. `body: "{}"`
 * (holocron#996, via `@theholocron/checkly-client`'s request-body
 * support, clients#396) is sent as Checkly's `bodyType: "RAW"`; its
 * exact content doesn't matter — the handler checks the signature
 * before ever parsing the body as JSON.
 */

import { defineConfig } from "@theholocron/cli";

export default defineConfig({
	// Redeploy after a release publishes (holocron#928, #930): the `deploy` job
	// in the shared delivery.publish workflow runs `holocron deploy on-release`,
	// which reads this task from every workspace package. `paths` default to this
	// package plus its `workspace:*` dependencies (the packages inlined into
	// `dist/`).
	// delivery.previewCheck (holocron#1010): runs the two monitoring checks
	// below against each PR's own Vercel preview deployment, not just
	// production — catching a breaking change before merge. Opted in here
	// (not every repo with a monitoring provider wants this) since it only
	// makes sense for a package with both monitoring checks AND a Vercel
	// preview deployment per PR, both true for Sentinel.
	tasks: [
		{ name: "delivery.deploy", with: { on: "release", channel: "alpha" } },
		// cwd tells the reusable workflow which package directory to run
		// `holocron monitoring check` from — the generated workflow checks
		// out the repo root, and this is a monorepo, so without it the CLI
		// would load this repo's own root holocron.config.ts (no monitoring
		// provider there) instead of this file.
		{ name: "delivery.previewCheck", with: { cwd: "packages/sentinel" } },
	],
	providers: {
		deployment: ["vercel", { teamId: "team_YrFqXg1QceAu0CdYdBmrDpop", domain: "sentinel.theholocron.dev" }],
		dns: "cloudflare",
		monitoring: [
			"checkly",
			{
				accountId: "fb82859a-4f62-4773-8404-db0f29f9262c",
				checks: [
					{
						name: "Sentinel webhook uptime",
						url: "https://sentinel.theholocron.dev/api/webhook",
						method: "GET",
						// Checkly requires at least one location or privateLocation —
						// no account-level default exists on a trial/Hobby plan.
						locations: ["us-east-1"],
						// 405 is the EXPECTED healthy response here (confirms the
						// function rejects non-POST) — without shouldFail, Checkly
						// classifies any 4xx as a platform-level failure before
						// assertions are even evaluated, regardless of a match.
						shouldFail: true,
						assertions: [
							{ source: "status_code", comparison: "equals", target: "405" },
							// Catches a regression where the status stays 405 but the
							// response body itself changes (e.g. a framework swap
							// changing the error page).
							{ source: "body", comparison: "equals", target: "Method Not Allowed" },
						],
					},
					{
						name: "Sentinel webhook signature verification",
						url: "https://sentinel.theholocron.dev/api/webhook",
						method: "POST",
						locations: ["us-east-1"],
						// A POST with no signature header always fails verification —
						// 401 is the expected response, same shouldFail reasoning as
						// the uptime check above.
						shouldFail: true,
						// Content is irrelevant — handler.ts checks the signature
						// before ever parsing this as JSON.
						body: "{}",
						assertions: [{ source: "status_code", comparison: "equals", target: "401" }],
					},
				],
			},
		],
		secrets: "github",
		vault: ["doppler", { project: "sentinel", config: "prd" }],
	},
});
