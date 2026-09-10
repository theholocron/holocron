/**
 * Telemetry sink interfaces — the seam between an application's telemetry
 * orchestration and the vendor SDKs. No `@sentry/node` / `posthog-node` import
 * lives outside `@theholocron/observability/errors` / `.../analytics`; every
 * other module talks to these interfaces, so a vendor swap (or a
 * {@link NoopErrorSink} for tests / opt-out) is one file. Same shape as
 * {@link Logger}.
 */

/** A running command span — `undefined` when the error sink is off. */
export interface CommandSpan {
	setStatus(ok: boolean): void;
	end(): void;
}

/** Error tracking + performance (Sentry). */
export interface ErrorSink {
	init(ctx: { dsn: string; release: string; environment: "ci" | "local"; tags: Record<string, string> }): void;
	/** Start a command span. Returns `undefined` for a no-op sink. */
	startSpan(name: string): CommandSpan | undefined;
	captureException(err: unknown): void;
	endSession(): void;
	flush(): Promise<void>;
}

/** Product analytics — usage, adoption, retention (PostHog). */
export interface AnalyticsSink {
	identify(distinctId: string, props: Record<string, unknown>): void;
	capture(distinctId: string, event: string, props: Record<string, unknown>): void;
	shutdown(): Promise<void>;
}

/**
 * The disabled path made explicit — one shared no-op instead of a scatter of
 * `if (!enabled) return` guards. Install it when telemetry is opted out or no
 * credentials resolve.
 */
export class NoopErrorSink implements ErrorSink {
	init(): void {}
	startSpan(): CommandSpan | undefined {
		return undefined;
	}
	captureException(): void {}
	endSession(): void {}
	async flush(): Promise<void> {}
}

/** @see NoopErrorSink */
export class NoopAnalyticsSink implements AnalyticsSink {
	identify(): void {}
	capture(): void {}
	async shutdown(): Promise<void> {}
}
