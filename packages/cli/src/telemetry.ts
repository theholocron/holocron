import type { ErrorEvent, EventHint } from "@sentry/node";
import * as Sentry from "@sentry/node";

import { env } from "./env.js";

// Holocron's own Sentry project — the fallback when no env var points elsewhere.
// Empty string = telemetry silently disabled (safe to ship before a project exists).
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

function isEnabled(): boolean {
	// `HOLOCRON_TELEMETRY=false` is the going-forward opt-out, shared with
	// `@theholocron/logger`'s Axiom transport. `NO_HOLOCRON_TELEMETRY` (any
	// truthy value) is kept for back-compat.
	const optedOut = env.get("HOLOCRON_TELEMETRY") === "false" || Boolean(env.get("NO_HOLOCRON_TELEMETRY"));
	return !optedOut && resolveDsn() !== "";
}

export function init(version: string): void {
	if (!isEnabled()) return;
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

export function startCommand(name: string): (ok: boolean) => void {
	if (!isEnabled()) return () => {};
	Sentry.setTag("command", name);
	const span = Sentry.startInactiveSpan({ name, op: "holocron.command", forceTransaction: true });
	return (ok: boolean) => {
		span.setStatus({ code: ok ? 1 : 2 });
		span.end();
	};
}

export function captureException(err: unknown): void {
	if (!isEnabled()) return;
	Sentry.captureException(err);
}

export function endSession(): void {
	if (!isEnabled()) return;
	Sentry.endSession();
}

export async function flush(): Promise<void> {
	if (!isEnabled()) return;
	await Sentry.close(2_000);
}

// Scrub known token shapes from any string in the Sentry event payload.
const TOKEN_RE = /\b(ghp_|ghs_|glpat-|xoxb-|xoxp-|npm_|sk-|[A-Z][A-Z0-9_]{2,}_TOKEN[=\s])[^\s"]*/g;

function redact(raw: string): string {
	return raw.replace(TOKEN_RE, "[REDACTED]");
}

function scrubError(event: ErrorEvent, _hint: EventHint): ErrorEvent {
	return JSON.parse(redact(JSON.stringify(event))) as ErrorEvent;
}
