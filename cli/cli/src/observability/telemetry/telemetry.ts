/**
 * CLI self-telemetry — errors (Sentry), usage analytics (PostHog).
 *
 * The orchestration is `createCliTelemetry` in `@theholocron/kyber/observability`
 * (no vendor SDK import here either: the sinks live in `@theholocron/observability`).
 * This module binds it to Holocron's values: the `HOLOCRON` env prefix, the
 * credentials resolved by `resolve-telemetry.ts`, and the logger's run id.
 * The single kill switch is `HOLOCRON_TELEMETRY=false` (legacy alias
 * `NO_HOLOCRON_TELEMETRY`); see ADR-0007 / ADR-0008.
 */

import { createCliTelemetry } from "@theholocron/kyber/observability";

import type { TelemetryConfig } from "../../config/index.js";
import { getRunId } from "../logger/index.js";
import { resolveDsn, resolvePostHogHost, resolvePostHogKey } from "../resolve-telemetry/index.js";

const telemetry = createCliTelemetry({
	envPrefix: "HOLOCRON",
	dsn: resolveDsn,
	posthogKey: resolvePostHogKey,
	posthogHost: resolvePostHogHost,
	getRunId: () => getRunId(),
});

/** Install the live sinks unless telemetry is opted out or a credential is empty. */
export const init = telemetry.init;

/** Apply the `telemetry` config block; it only ever narrows what `init` turned on. */
export const applyConfig: (cfg: TelemetryConfig | undefined) => void = telemetry.applyConfig;

/** Capture a PostHog event, scrubbed of secrets. */
export const event = telemetry.event;

/** Start a command span; call the returned function with the outcome. */
export const startCommand = telemetry.startCommand;

/** Report an error to Sentry. */
export const captureException = telemetry.captureException;

/** End the Sentry session. */
export const endSession = telemetry.endSession;

/** Drain both sinks and return to the no-ops. */
export const flush = telemetry.flush;

/** Test hook: drop sinks and command state back to the no-op defaults. */
export const resetTelemetry = telemetry.resetTelemetry;
