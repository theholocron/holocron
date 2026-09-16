/**
 * `@theholocron/sentinel` — Holocron's minimal GitHub App.
 *
 * A sentinel droid: it watches, validates, and reports — never acts on its
 * own. Webhook receiver, default-branch-only `holocron.config.ts`
 * validation, custom-properties sync, one check run per resolution run.
 * Design: `.notes/tech-sentinel-v1.spec.md` (repo root).
 *
 * Scaffolding — actual deploy wiring lands in a follow-up PR once the
 * deploy target is decided (see the spec's "Open, not yet decided"
 * section). Everything exported here is already deploy-target-agnostic:
 * plain functions over already-fetched/verified inputs, no HTTP framework.
 */

export { postCheckRun, type PostCheckRunInput, type PostCheckRunResult } from "./post-check-run.js";
export { syncPropertiesFromConfig, type SyncPropertiesInput, type SyncPropertiesResult } from "./sync-properties.js";
export { validateConfig, type ValidateConfigInput, type ValidateConfigResult } from "./validate-config.js";
export {
	parseWebhookEvent,
	type ParseWebhookEventInput,
	type ParseWebhookResult,
	type SentinelEvent,
	type SentinelEventType,
	WebhookVerificationError,
} from "./webhook.js";
