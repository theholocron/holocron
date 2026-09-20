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
 *     build → stage → `holocron deploy --target production`.
 *   - `holocron setup --cwd packages/sentinel` (one-time, manual):
 *     attaches the custom domain to the Vercel project and hands any
 *     verification CNAME to the `dns` provider — `source` being
 *     unconfigured just means every repo-settings step is skipped
 *     (each gated on `loader.has("source")`), not that setup fails.
 *
 * `deployment`: Vercel, a Team separate from any other Vercel project
 * in this org (ADR-0011's deploy-target decision). `teamId` is not a
 * credential — same non-secret-identifier status as Cloudflare's
 * `accountId` elsewhere in this org — safe to commit directly.
 *
 * `vault`: Doppler, for the still-separate "secrets flow" PR-stack
 * item (`holocron secrets sync` → Vercel env vars) to push the GitHub
 * App's private key + webhook secret from. `project: "sentinel"`,
 * `config: "prd"` — confirmed against the real Doppler project.
 *
 * `dns`: Cloudflare — receives the CNAME challenge `holocron setup`
 * gets back from `Deployment.ensureCustomDomain()` when it adds
 * `sentinel.theholocron.dev` to the Vercel project, via
 * `Dns.upsertRecord()`.
 */

import { defineConfig } from "@theholocron/cli";

export default defineConfig({
	providers: {
		deployment: ["vercel", { teamId: "team_YrFqXg1QceAu0CdYdBmrDpop", domain: "sentinel.theholocron.dev" }],
		dns: "cloudflare",
		vault: ["doppler", { project: "sentinel", config: "prd" }],
	},
});
