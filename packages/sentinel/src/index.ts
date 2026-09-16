/**
 * `@theholocron/sentinel` — Holocron's minimal GitHub App.
 *
 * A sentinel droid: it watches, validates, and reports — never acts on its
 * own. Webhook receiver, default-branch-only `holocron.config.ts`
 * validation, custom-properties sync, one check run per resolution run.
 * Design: `.notes/tech-sentinel-v1.spec.md` (repo root).
 *
 * Scaffolding — the webhook receiver, custom-properties sync call, and
 * check-run posting land in follow-up PRs once the deploy target is
 * decided (see the spec's "Open, not yet decided" section).
 */

export { validateConfig, type ValidateConfigInput, type ValidateConfigResult } from "./validate-config.js";
