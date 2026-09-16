/**
 * `@theholocron/sentinel` — Holocron's minimal GitHub App.
 *
 * A sentinel droid: it watches, validates, and reports — never acts on its
 * own. Webhook receiver, default-branch-only `holocron.config.ts`
 * validation, custom-properties sync, one check run per resolution run.
 * Design: `.notes/tech-sentinel-v1.spec.md` (repo root).
 *
 * `src/utils/` — read-only: fetches, parses, verifies, never mutates
 * GitHub (`validateConfig`, `parseWebhookEvent`, plus their shared
 * `decodeContents`/`findPackageRoot`/`SENTINEL_APP_NAME` helpers).
 * `src/actions/` — writes: calls a GitHub API that changes repo state
 * (`syncPropertiesFromConfig`, `postCheckRun`). A future webhook handler
 * calls utils to decide, then actions to report — never the other way
 * around.
 *
 * Scaffolding — actual deploy wiring lands in a follow-up PR once the
 * deploy target is decided (see the spec's "Open, not yet decided"
 * section). Everything exported here is already deploy-target-agnostic:
 * plain functions over already-fetched/verified inputs, no HTTP framework.
 */

export {
	postCheckRun,
	type PostCheckRunInput,
	type PostCheckRunResult,
	SENTINEL_CHECK_RUN_NAME,
} from "./actions/post-check-run.js";
export {
	syncPropertiesFromConfig,
	type SyncPropertiesInput,
	type SyncPropertiesResult,
} from "./actions/sync-properties.js";
export { SENTINEL_APP_NAME } from "./utils/constants.js";
export { validateConfig, type ValidateConfigInput, type ValidateConfigResult } from "./utils/validate-config.js";
export {
	parseWebhookEvent,
	type ParseWebhookEventInput,
	type ParseWebhookResult,
	type SentinelEvent,
	type SentinelEventType,
	WebhookVerificationError,
} from "./utils/webhook.js";
