/**
 * Sentinel's own deploy config — separate from this monorepo's root
 * `holocron.config.ts` (which governs `holocron`'s own CI/build), since
 * Sentinel is deployed as its own product, not built/released the way
 * the CLI or the plugins are. Not auto-discovered by anything in
 * `packages/sentinel/package.json`'s scripts today — invoked directly:
 *
 *   holocron deploy --files packages/sentinel/dist \
 *     --project-id sentinel --cwd packages/sentinel
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
 * `dns`: Cloudflare receives the CNAME challenge returned when Vercel adds
 * `sentinel.holocron.dev`; `holocron setup` creates or updates that record.
 */

import { defineConfig } from "@theholocron/cli";

export default defineConfig({
	providers: {
		deployment: ["vercel", { teamId: "team_YrFqXg1QceAu0CdYdBmrDpop", domain: "sentinel.holocron.dev" }],
		dns: "cloudflare",
		vault: ["doppler", { project: "sentinel", config: "prd" }],
	},
});
