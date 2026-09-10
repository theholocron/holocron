/**
 * `SentrySink` — the **only** `@sentry/node` import in the CLI. Error tracking +
 * per-command performance spans, activated self-contained per ADR-0007:
 *
 *   HOLOCRON_SENTRY_DSN  →  SENTRY_DSN  →  built-in fallback DSN
 *
 * A consumer repo with `SENTRY_DSN` set gets CLI errors routed to its own
 * project with no config. An empty resolved DSN means "silently off" (safe to
 * ship before a project exists) — {@link resolveDsn} returning `""` is how the
 * caller decides to install a `NoopErrorSink` instead.
 */

import type { ErrorEvent, EventHint } from "@sentry/node";
import * as Sentry from "@sentry/node";

import { env } from "../env.js";
import { redactObject } from "./redact.js";
import type { CommandSpan, ErrorSink } from "./sinks.js";

// Holocron's own Sentry project — the fallback when no env var points elsewhere.
const FALLBACK_DSN = "https://95cbb72ad5636c94e119a5405ee8f55f@o4508238154104832.ingest.us.sentry.io/4511810950791168";

/** Resolve the Sentry DSN. `""` → error telemetry disabled. */
export function resolveDsn(): string {
	return env.get("HOLOCRON_SENTRY_DSN") ?? env.get("SENTRY_DSN") ?? FALLBACK_DSN;
}

/** `beforeSend` — token-shaped strings never leave the process. */
export function scrubError(event: ErrorEvent, _hint: EventHint): ErrorEvent {
	return redactObject(event);
}

export class SentrySink implements ErrorSink {
	init(ctx: { release: string; environment: "ci" | "local"; tags: Record<string, string> }): void {
		Sentry.init({
			dsn: resolveDsn(),
			release: ctx.release,
			environment: ctx.environment,
			tracesSampleRate: 1.0,
			beforeSend: scrubError,
		});
		Sentry.startSession();
		for (const [key, value] of Object.entries(ctx.tags)) Sentry.setTag(key, value);
	}

	startSpan(name: string): CommandSpan {
		Sentry.setTag("command", name);
		const span = Sentry.startInactiveSpan({ name, op: "holocron.command", forceTransaction: true });
		return {
			setStatus: (ok) => span.setStatus({ code: ok ? 1 : 2 }),
			end: () => span.end(),
		};
	}

	captureException(err: unknown): void {
		Sentry.captureException(err);
	}

	endSession(): void {
		Sentry.endSession();
	}

	async flush(): Promise<void> {
		await Sentry.close(2_000);
	}
}
