import { createHash } from "node:crypto";
import { hostname, userInfo } from "node:os";

import type { ErrorEvent, EventHint } from "@sentry/node";
import * as Sentry from "@sentry/node";
import { PostHog } from "posthog-node";

import { env } from "./env.js";
import { getRunId } from "./logger.js";

// ── Sentry (errors) ──────────────────────────────────────────────────────────

// Holocron's own Sentry project — the fallback when no env var points elsewhere.
// Empty string = error telemetry silently disabled (safe to ship before a project exists).
const FALLBACK_DSN = "https://95cbb72ad5636c94e119a5405ee8f55f@o4508238154104832.ingest.us.sentry.io/4511810950791168";

/**
 * Resolve the Sentry DSN — the `errors` capability's self-contained
 * activation, per ADR-0007:
 *
 *   HOLOCRON_SENTRY_DSN  →  SENTRY_DSN  →  built-in fallback
 *
 * A consumer repo with `SENTRY_DSN` set gets CLI errors routed to its own
 * project with no config. Opt out entirely with `HOLOCRON_TELEMETRY=false`.
 */
function resolveDsn(): string {
	return env.get("HOLOCRON_SENTRY_DSN") ?? env.get("SENTRY_DSN") ?? FALLBACK_DSN;
}

// ── PostHog (product analytics) ──────────────────────────────────────────────

// Holocron's own PostHog project — an ingest-only project write key (`phc_…`).
// It can capture events, never read data, so it ships in the published package
// (usage telemetry on by default) — the same risk profile as the hard-coded
// Sentry DSN above. Per ADR-0008. The `gitleaks:allow` marks it as publishable,
// not a leaked secret.
const FALLBACK_POSTHOG_PROJECT_TOKEN = "phc_AC4vFCvYzwnzmG7Vg5nEc3PZKZztoPyfKp4Lb9BbXcLK"; // gitleaks:allow
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * Resolve the PostHog project key — mirrors {@link resolveDsn} and the
 * `HOLOCRON_AXIOM_TOKEN` / `AXIOM_TOKEN` pattern, per ADR-0008:
 *
 *   HOLOCRON_POSTHOG_PROJECT_TOKEN  →  POSTHOG_PROJECT_TOKEN  →  built-in fallback
 *
 * `POSTHOG_PROJECT_TOKEN` is the vendor-native name a consumer repo sets (as a
 * plain variable, not a secret — the `phc_…` key is publishable) to route CLI
 * usage to its own project.
 */
function resolvePostHogKey(): string {
	return (
		env.get("HOLOCRON_POSTHOG_PROJECT_TOKEN") ?? env.get("POSTHOG_PROJECT_TOKEN") ?? FALLBACK_POSTHOG_PROJECT_TOKEN
	);
}

function resolvePostHogHost(): string {
	return env.get("HOLOCRON_POSTHOG_HOST") ?? env.get("POSTHOG_HOST") ?? DEFAULT_POSTHOG_HOST;
}

// ── shared gate ──────────────────────────────────────────────────────────────

function isEnabled(): boolean {
	// `HOLOCRON_TELEMETRY=false` is the going-forward opt-out, shared across all
	// three sinks (Sentry errors, Axiom logs, PostHog analytics). `NO_HOLOCRON_TELEMETRY`
	// (any truthy value) is kept for back-compat.
	return env.get("HOLOCRON_TELEMETRY") !== "false" && !env.get("NO_HOLOCRON_TELEMETRY");
}

// Per-sink gates: a sink with a blanked fallback constant (see `FALLBACK_DSN` —
// "safe to ship before a project exists") stays dark without disabling the others.
const sentryEnabled = (): boolean => isEnabled() && resolveDsn() !== "";
const posthogEnabled = (): boolean => isEnabled() && resolvePostHogKey() !== "";

// ── PostHog client + identity ────────────────────────────────────────────────

let posthog: PostHog | undefined;
let commandStartedAt = 0;
let currentCommand = "unknown";

/**
 * Anonymous, stable per-machine id — `sha256(hostname + username)` truncated
 * (ADR-0008). A one-way fingerprint: no raw hostname or username is ever
 * transmitted, and it is not personal data under this project's rule.
 */
function machineId(): string {
	try {
		return createHash("sha256").update(`${hostname()} ${userInfo().username}`).digest("hex").slice(0, 32);
	} catch {
		return "unknown";
	}
}

/** Properties every event carries, so any event can be pivoted to its Axiom trace. */
function baseProps(): Record<string, unknown> {
	const runId = getRunId();
	return {
		command: currentCommand,
		ci: Boolean(env.get("CI")),
		...(runId ? { runId } : {}),
	};
}

/**
 * Capture a PostHog event. Runs every `properties` object through the same
 * token scrubber Sentry uses (defence-in-depth — values are controlled).
 */
export function event(name: string, properties: Record<string, unknown> = {}): void {
	if (!posthogEnabled() || !posthog) return;
	const merged = { ...baseProps(), ...properties };
	posthog.capture({
		distinctId: machineId(),
		event: name,
		properties: JSON.parse(redact(JSON.stringify(merged))) as Record<string, unknown>,
	});
}

// ── lifecycle ────────────────────────────────────────────────────────────────

export function init(version: string): void {
	initSentry(version);
	initPostHog(version);
}

function initSentry(version: string): void {
	if (!sentryEnabled()) return;
	Sentry.init({
		dsn: resolveDsn(),
		release: `holocron@${version}`,
		environment: env.get("CI") ? "ci" : "local",
		tracesSampleRate: 1.0,
		beforeSend: scrubError,
	});
	Sentry.startSession();
	Sentry.setTag("os", process.platform);
	Sentry.setTag("node", process.version);
	Sentry.setTag("ci", String(Boolean(env.get("CI"))));
}

function initPostHog(version: string): void {
	if (!posthogEnabled()) return;
	posthog = new PostHog(resolvePostHogKey(), { host: resolvePostHogHost() });
	posthog.identify({
		distinctId: machineId(),
		properties: {
			ci: Boolean(env.get("CI")),
			os: process.platform,
			node: process.version,
			cli: version,
			...(env.get("HOLOCRON_ORG") ? { org: env.get("HOLOCRON_ORG") } : {}),
		},
	});
}

let lastErrorType: string | undefined;

/** Start a Sentry command span, or `undefined` when Sentry is off. */
function startSpan(name: string): ReturnType<typeof Sentry.startInactiveSpan> | undefined {
	if (!sentryEnabled()) return undefined;
	Sentry.setTag("command", name);
	return Sentry.startInactiveSpan({ name, op: "holocron.command", forceTransaction: true });
}

export function startCommand(name: string): (ok: boolean) => void {
	currentCommand = name;
	commandStartedAt = Date.now();
	lastErrorType = undefined;

	const span = startSpan(name);
	event("command_started", { dry_run: process.argv.includes("--dry-run") });

	return (ok: boolean) => {
		if (span) {
			span.setStatus({ code: ok ? 1 : 2 });
			span.end();
		}
		event(ok ? "command_completed" : "command_failed", {
			status: ok ? "ok" : "fail",
			duration_ms: Date.now() - commandStartedAt,
			...(ok || !lastErrorType ? {} : { error_type: lastErrorType }),
		});
	};
}

export function captureException(err: unknown): void {
	lastErrorType = err instanceof Error ? err.constructor.name : "Error";
	if (!sentryEnabled()) return;
	Sentry.captureException(err);
}

export function endSession(): void {
	if (!sentryEnabled()) return;
	Sentry.endSession();
}

export async function flush(): Promise<void> {
	if (sentryEnabled()) await Sentry.close(2_000);
	if (posthog) {
		await posthog.shutdown();
		posthog = undefined;
	}
}

// ── redaction ────────────────────────────────────────────────────────────────

// Scrub known token shapes from any string in a telemetry payload.
const TOKEN_RE = /\b(ghp_|ghs_|glpat-|xoxb-|xoxp-|npm_|sk-|[A-Z][A-Z0-9_]{2,}_TOKEN[=\s])[^\s"]*/g;

function redact(raw: string): string {
	return raw.replace(TOKEN_RE, "[REDACTED]");
}

function scrubError(event: ErrorEvent, _hint: EventHint): ErrorEvent {
	return JSON.parse(redact(JSON.stringify(event))) as ErrorEvent;
}

/** Test hook — drop the memoized PostHog client + command state. */
export function resetTelemetry(): void {
	posthog = undefined;
	commandStartedAt = 0;
	currentCommand = "unknown";
	lastErrorType = undefined;
}
