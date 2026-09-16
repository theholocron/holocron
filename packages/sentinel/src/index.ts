/**
 * `@theholocron/sentinel` — Holocron's minimal GitHub App.
 *
 * A sentinel droid: it watches, validates, and reports — never acts on its
 * own. Webhook receiver, default-branch-only `holocron.config.ts`
 * validation, custom-properties sync, one check run per resolution run.
 * Design: `.notes/tech-sentinel-v1.spec.md` (repo root).
 *
 * Scaffolding — the custom-properties sync call and check-run posting
 * land in follow-up PRs once the deploy target is decided (see the
 * spec's "Open, not yet decided" section). `parseWebhookEvent()` itself
 * is deploy-target-agnostic already: a plain function over
 * `{ body, headers, secret }`.
 */

export { validateConfig, type ValidateConfigInput, type ValidateConfigResult } from "./validate-config.js";
export {
	parseWebhookEvent,
	type ParseWebhookEventInput,
	type ParseWebhookResult,
	type SentinelEvent,
	type SentinelEventType,
	WebhookVerificationError,
} from "./webhook.js";
