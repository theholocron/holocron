/**
 * Holocron-specific credential resolution for the telemetry sinks — the env
 * chain plus Holocron's own shipped fallbacks. This is **CLI policy**, not part
 * of the portable adapter set: `sentry-sink.ts` / `posthog-sink.ts` take a
 * resolved DSN / key and never read the environment. When the adapters move to
 * `@theholocron/observability` (#635) this module stays here.
 *
 *   errors:    HOLOCRON_SENTRY_DSN            → SENTRY_DSN            → FALLBACK_DSN
 *   analytics: HOLOCRON_POSTHOG_PROJECT_TOKEN → POSTHOG_PROJECT_TOKEN → FALLBACK_POSTHOG_PROJECT_TOKEN
 *   host:      HOLOCRON_POSTHOG_HOST          → POSTHOG_HOST          → DEFAULT_POSTHOG_HOST
 *
 * The `SENTRY_DSN` / `POSTHOG_PROJECT_TOKEN` fallbacks are the vendor-native
 * names a consumer repo sets to route CLI telemetry to its own project. The
 * built-in fallbacks are ingest-only keys — publishable by design, same risk
 * model as ADR-0007 / ADR-0008.
 */

import { env } from "../env.js";

/** Holocron's own Sentry project — the fallback when no env var points elsewhere. */
const FALLBACK_DSN = "https://95cbb72ad5636c94e119a5405ee8f55f@o4508238154104832.ingest.us.sentry.io/4511810950791168";

/** Holocron's own PostHog project write key — ingest-only. */
const FALLBACK_POSTHOG_PROJECT_TOKEN = "phc_AC4vFCvYzwnzmG7Vg5nEc3PZKZztoPyfKp4Lb9BbXcLK"; // gitleaks:allow

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/** Resolve the Sentry DSN. `""` → error telemetry disabled. */
export function resolveDsn(): string {
	return env.get("HOLOCRON_SENTRY_DSN") ?? env.get("SENTRY_DSN") ?? FALLBACK_DSN;
}

/** Resolve the PostHog project key. `""` → usage analytics disabled. */
export function resolvePostHogKey(): string {
	return (
		env.get("HOLOCRON_POSTHOG_PROJECT_TOKEN") ?? env.get("POSTHOG_PROJECT_TOKEN") ?? FALLBACK_POSTHOG_PROJECT_TOKEN
	);
}

/** Resolve the PostHog ingest host. */
export function resolvePostHogHost(): string {
	return env.get("HOLOCRON_POSTHOG_HOST") ?? env.get("POSTHOG_HOST") ?? DEFAULT_POSTHOG_HOST;
}
