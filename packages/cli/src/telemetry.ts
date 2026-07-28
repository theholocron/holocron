import type { ErrorEvent, EventHint } from "@sentry/node";
import * as Sentry from "@sentry/node";

// Paste your DSN from Sentry → Settings → Client Keys once the project is created.
// Empty string = telemetry silently disabled — safe to ship before the project exists.
const DSN = "";

function isEnabled(): boolean {
	return !process.env.NO_HOLOCRON_TELEMETRY && DSN !== "";
}

export function init(version: string): void {
	if (!isEnabled()) return;
	Sentry.init({
		dsn: DSN,
		release: `holocron@${version}`,
		environment: process.env.CI ? "ci" : "local",
		tracesSampleRate: 1.0,
		beforeSend: scrubError,
	});
	Sentry.setTag("os", process.platform);
	Sentry.setTag("node", process.version);
	Sentry.setTag("ci", String(Boolean(process.env.CI)));
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

export async function flush(): Promise<void> {
	if (!isEnabled()) return;
	await Sentry.close(2_000);
}

// Scrub known token shapes from any string in the Sentry event payload.
const TOKEN_RE = /\b(ghp_|ghs_|glpat-|xoxb-|xoxp-|npm_|sk-|[A-Z][A-Z0-9_]{2,}_TOKEN[=\s"'])\S*/g;

function redact(raw: string): string {
	return raw.replace(TOKEN_RE, "[REDACTED]");
}

function scrubError(event: ErrorEvent, _hint: EventHint): ErrorEvent {
	return JSON.parse(redact(JSON.stringify(event))) as ErrorEvent;
}

