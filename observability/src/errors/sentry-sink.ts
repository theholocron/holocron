/**
 * `SentrySink` — the **only** `@sentry/node` call site. A portable `ErrorSink`
 * adapter: error tracking + per-command performance spans. It reads no
 * environment and ships no credentials — `init()` takes a resolved `dsn`; the
 * caller owns the env chain and any fallback. An empty `dsn` is the caller's
 * signal to install a `NoopErrorSink` instead — it is never passed here.
 *
 * `@sentry/node` is an optional peer dependency. For a browser / edge / React
 * Native context use `@sentry/nextjs` or `@sentry/react-native` behind the
 * same {@link ErrorSink} interface.
 */

import type { ErrorEvent, EventHint } from "@sentry/node";
import * as Sentry from "@sentry/node";

import { redactObject } from "../core/redact.js";
import type { CommandSpan, ErrorSink } from "../core/sinks.js";

/** `beforeSend` — token-shaped strings never leave the process. */
export function scrubError(event: ErrorEvent, _hint: EventHint): ErrorEvent {
	return redactObject(event);
}

export class SentrySink implements ErrorSink {
	init(ctx: { dsn: string; release: string; environment: "ci" | "local"; tags: Record<string, string> }): void {
		Sentry.init({
			dsn: ctx.dsn,
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
