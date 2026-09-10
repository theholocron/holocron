/**
 * CLI self-telemetry orchestration — errors (Sentry), usage analytics (PostHog).
 *
 * This module holds *no* vendor SDK import. Each concern sits behind a
 * Holocron-owned interface ({@link ErrorSink} / {@link AnalyticsSink}); the
 * concrete `SentrySink` / `PostHogSink` are the only `@sentry/node` /
 * `posthog-node` call sites, and a `Noop*Sink` is installed when telemetry is
 * off. Same seam `@theholocron/logger` uses for Pino.
 *
 * Activation is env-var + shipped-fallback, resolved inside each sink. The
 * single kill switch is `HOLOCRON_TELEMETRY=false` (legacy alias
 * `NO_HOLOCRON_TELEMETRY`); see ADR-0007 / ADR-0008.
 */

import { createHash } from "node:crypto";
import { hostname, userInfo } from "node:os";

import { env } from "./env.js";
import { getRunId } from "./logger.js";
import { PostHogSink, resolvePostHogKey } from "./telemetry/posthog-sink.js";
import { redactObject } from "./telemetry/redact.js";
import { resolveDsn, SentrySink } from "./telemetry/sentry-sink.js";
import {
	type AnalyticsSink,
	type CommandSpan,
	type ErrorSink,
	NoopAnalyticsSink,
	NoopErrorSink,
} from "./telemetry/sinks.js";

// ── sinks ────────────────────────────────────────────────────────────────────

let errors: ErrorSink = new NoopErrorSink();
let analytics: AnalyticsSink = new NoopAnalyticsSink();

// ── gate ─────────────────────────────────────────────────────────────────────

/**
 * The shared opt-out. `HOLOCRON_TELEMETRY=false` (going-forward) or
 * `NO_HOLOCRON_TELEMETRY` (any truthy value, back-compat) disables all sinks.
 */
function isEnabled(): boolean {
	return env.get("HOLOCRON_TELEMETRY") !== "false" && !env.get("NO_HOLOCRON_TELEMETRY");
}

// ── identity ─────────────────────────────────────────────────────────────────

let commandStartedAt = 0;
let currentCommand = "unknown";
let lastErrorType: string | undefined;
let currentSpan: CommandSpan | undefined;

/**
 * Anonymous, stable per-machine id — `sha256(hostname + username)` truncated
 * (ADR-0008). One-way: no raw hostname or username is ever transmitted.
 */
function machineId(): string {
	try {
		return createHash("sha256").update(`${hostname()} ${userInfo().username}`).digest("hex").slice(0, 32);
	} catch {
		return "unknown";
	}
}

/** Properties every analytics event carries — pivot key to the Axiom trace. */
function baseProps(): Record<string, unknown> {
	const runId = getRunId();
	return {
		command: currentCommand,
		ci: Boolean(env.get("CI")),
		...(runId ? { runId } : {}),
	};
}

// ── lifecycle ────────────────────────────────────────────────────────────────

export function init(version: string): void {
	if (isEnabled() && resolveDsn() !== "") {
		errors = new SentrySink();
		errors.init({
			release: `holocron@${version}`,
			environment: env.get("CI") ? "ci" : "local",
			tags: { os: process.platform, node: process.version, ci: String(Boolean(env.get("CI"))) },
		});
	}
	if (isEnabled() && resolvePostHogKey() !== "") {
		analytics = new PostHogSink();
		analytics.identify(machineId(), {
			ci: Boolean(env.get("CI")),
			os: process.platform,
			node: process.version,
			cli: version,
			...(env.get("HOLOCRON_ORG") ? { org: env.get("HOLOCRON_ORG") } : {}),
		});
	}
}

/** Capture a PostHog event. Every `properties` object runs through the scrubber. */
export function event(name: string, properties: Record<string, unknown> = {}): void {
	analytics.capture(machineId(), name, redactObject({ ...baseProps(), ...properties }));
}

export function startCommand(name: string): (ok: boolean) => void {
	currentCommand = name;
	commandStartedAt = Date.now();
	lastErrorType = undefined;
	currentSpan = errors.startSpan(name);

	event("command_started", { dry_run: process.argv.includes("--dry-run") });

	return (ok: boolean) => {
		currentSpan?.setStatus(ok);
		currentSpan?.end();
		event(ok ? "command_completed" : "command_failed", {
			status: ok ? "ok" : "fail",
			duration_ms: Date.now() - commandStartedAt,
			...(ok || !lastErrorType ? {} : { error_type: lastErrorType }),
		});
	};
}

export function captureException(err: unknown): void {
	lastErrorType = err instanceof Error ? err.constructor.name : "Error";
	errors.captureException(err);
}

export function endSession(): void {
	errors.endSession();
}

export async function flush(): Promise<void> {
	await errors.flush();
	await analytics.shutdown();
	errors = new NoopErrorSink();
	analytics = new NoopAnalyticsSink();
}

// ── test hook ────────────────────────────────────────────────────────────────

/** Drop the sinks + command state back to their no-op defaults. */
export function resetTelemetry(): void {
	errors = new NoopErrorSink();
	analytics = new NoopAnalyticsSink();
	commandStartedAt = 0;
	currentCommand = "unknown";
	lastErrorType = undefined;
	currentSpan = undefined;
}
