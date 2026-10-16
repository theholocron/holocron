/**
 * `@theholocron/sentinel` — Holocron's minimal GitHub App.
 *
 * A sentinel droid: it watches, validates, and reports — never acts on its
 * own. Webhook receiver, default-branch-only `holocron.config.ts`
 * validation, custom-properties sync, one check run per resolution run.
 * Design: `docs/wiki/specifications/tech-sentinel-v1.spec.md`.
 *
 * `src/utils/` — read-only: fetches, parses, verifies, never mutates
 * GitHub (`validateConfig`, `parseWebhookEvent`, plus their shared
 * `decodeContents`/`findPackageRoot`/`SENTINEL_APP_NAME` helpers).
 * `src/actions/` — writes: calls a GitHub API that changes repo state
 * (`syncPropertiesFromConfig`, `postCheckRun`, `lintCommits` +
 * `postCommitStandardsCheck` — the org-wide centralized commit-message
 * linting, holocron#769/#771). `handleWebhookRequest` (`src/handler/handler.ts`)
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

export type { PostCheckRunInput, PostCheckRunResult } from "./actions/capability-compliance/post-check-run/index.js";
export { postCheckRun, SENTINEL_CHECK_RUN_NAME } from "./actions/capability-compliance/post-check-run/index.js";
export type {
	SyncPropertiesInput,
	SyncPropertiesResult,
} from "./actions/capability-compliance/sync-properties/index.js";
export { syncPropertiesFromConfig } from "./actions/capability-compliance/sync-properties/index.js";
export type {
	CommitViolation,
	LintCommitsInput,
	LintCommitsResult,
} from "./actions/commit-standards/lint-commits/index.js";
export { lintCommits } from "./actions/commit-standards/lint-commits/index.js";
export type {
	PostCommitStandardsCheckInput,
	PostCommitStandardsCheckResult,
} from "./actions/commit-standards/post-commit-standards-check/index.js";
export {
	postCommitStandardsCheck,
	SENTINEL_COMMIT_STANDARDS_CHECK_RUN_NAME,
} from "./actions/commit-standards/post-commit-standards-check/index.js";
export type { Env } from "./handler/index.js";
export { handleWebhookRequest } from "./handler/index.js";
export { SENTINEL_APP_NAME } from "./utils/constants/index.js";
export type { ValidateConfigInput, ValidateConfigResult } from "./utils/validate-config/index.js";
export { validateConfig } from "./utils/validate-config/index.js";
export type {
	ParseWebhookEventInput,
	ParseWebhookResult,
	SentinelEvent,
	SentinelEventType,
} from "./utils/webhook/index.js";
export { parseWebhookEvent, WebhookVerificationError } from "./utils/webhook/index.js";
