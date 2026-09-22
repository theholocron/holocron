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
 * (`syncPropertiesFromConfig`, `postCheckRun`, `lintCommits` +
 * `postCommitStandardsCheck` — the org-wide centralized commit-message
 * linting, holocron#769/#771). `handleWebhookRequest` (`src/handler.ts`)
 * is the orchestration sitting above both — utils to decide, actions to
 * report, never the other way around.
 *
 * `handleWebhookRequest` is deliberately platform-agnostic: a plain
 * `(Request, Env) => Response` function, no deploy-target-specific
 * wrapper. Actual deploy wiring — a thin per-platform adapter, plus
 * Sentinel's own `holocron.config.ts` — is a still-open PR-stack item
 * (see the spec's "Resolved — deploy target" section: Vercel Functions,
 * not Cloudflare Workers — `validateConfig()`'s temp-file-based module
 * loading needs a real filesystem Workers' isolate model doesn't have).
 */

export {
	postCheckRun,
	type PostCheckRunInput,
	type PostCheckRunResult,
	SENTINEL_CHECK_RUN_NAME,
} from "./actions/capability-compliance/post-check-run.js";
export {
	syncPropertiesFromConfig,
	type SyncPropertiesInput,
	type SyncPropertiesResult,
} from "./actions/capability-compliance/sync-properties.js";
export {
	type CommitViolation,
	lintCommits,
	type LintCommitsInput,
	type LintCommitsResult,
} from "./actions/commit-standards/lint-commits.js";
export {
	postCommitStandardsCheck,
	type PostCommitStandardsCheckInput,
	type PostCommitStandardsCheckResult,
	SENTINEL_COMMIT_STANDARDS_CHECK_RUN_NAME,
} from "./actions/commit-standards/post-commit-standards-check.js";
export { type Env, handleWebhookRequest } from "./handler.js";
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
