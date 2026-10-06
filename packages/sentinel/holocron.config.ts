/**
 * Sentinel's own deploy config — separate from this monorepo's root
 * `holocron.config.ts` (which governs `holocron`'s own CI/build), since
 * Sentinel is deployed as its own product, not built/released the way
 * the CLI or the plugins are. Not part of the recurring `holocron ci`
 * gate (no `source` provider — Sentinel has no repo-settings surface
 * of its own to check).
 *
 * Two separate invocations, different frequency:
 *   - `pnpm run delivery.deploy` (recurring, every real deploy):
 *     build → `scripts/stage-deploy-netlify.mjs` (calls
 *     `@theholocron/netlify-client`'s `deploys.create()` directly —
 *     NOT `holocron deploy`, since `Deployment.deployFunction` isn't
 *     implemented for Netlify, see the plugin's own doc comment).
 *   - `holocron setup --cwd packages/sentinel` (one-time, manual):
 *     attaches the custom domain to the Netlify site and hands any
 *     verification CNAME to the `dns` provider — `source` being
 *     unconfigured just means every repo-settings step is skipped
 *     (each gated on `loader.has("source")`), not that setup fails.
 *
 * `deployment`: Netlify (holocron#940/#945 — migrated off Vercel for
 * cost reasons ADR-0011 never had to weigh, parked pending the
 * redeploy-cadence/architecture question in
 * `.notes/tech-sentinel-deploy-architecture-reconsideration.spec.md`).
 * `accountSlug`/`accountId` are not credentials — same
 * non-secret-identifier status Vercel's `teamId` already had — safe to
 * commit directly.
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
 * scope it down to that one key; the other 4 are Netlify-only and would
 * otherwise get pushed as pointless repo secrets on `holocron` (nothing
 * in this repo's own CI reads them).
 *
 * `dns`: Cloudflare — receives the CNAME challenge `holocron setup`
 * gets back from `Deployment.ensureCustomDomain()` when it adds
 * `sentinel.theholocron.dev` to the Netlify site, via
 * `Dns.upsertRecord()`.
 *
 * NOT YET LIVE: this config reflects the parked Netlify cutover
 * (holocron#945) — `delivery.deploy` targets Netlify in this branch,
 * but the DNS repoint and GitHub App webhook URL flip (both external,
 * manual) haven't happened. Vercel is still what's actually serving
 * `sentinel.theholocron.dev` until that decision is made.
 */

import { defineConfig } from "@theholocron/cli";

export default defineConfig({
	// Redeploy after a release publishes (holocron#928, #930): the `deploy` job
	// in the shared delivery.publish workflow runs `holocron deploy-on-release`,
	// which reads this task from every workspace package. `paths` default to this
	// package plus its `workspace:*` dependencies (the packages inlined into
	// `dist/`). Cadence itself is the open question in
	// tech-sentinel-deploy-architecture-reconsideration.spec.md — unchanged here
	// pending that decision.
	tasks: [{ name: "delivery.deploy", with: { on: "release", channel: "alpha" } }],
	providers: {
		deployment: [
			"netlify",
			{ accountSlug: "holocron", accountId: "6ac41cd9a87355ef3d13d261", domain: "sentinel.theholocron.dev" },
		],
		dns: "cloudflare",
		secrets: "github",
		vault: ["doppler", { project: "sentinel", config: "prd" }],
	},
});
