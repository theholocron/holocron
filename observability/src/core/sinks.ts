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
	/** Marks the span as succeeded (`true`) or failed (`false`). */
	setStatus(ok: boolean): void;
	/** Ends the span and records its duration. */
	end(): void;
}

/** Error tracking + performance (Sentry). */
export interface ErrorSink {
	/** Initialises the tracker with the resolved DSN, release, environment and tags applied to every event. */
	init(ctx: { dsn: string; release: string; environment: "ci" | "local"; tags: Record<string, string> }): void;
	/** Start a command span. Returns `undefined` for a no-op sink. */
	startSpan(name: string): CommandSpan | undefined;
	/** Reports an error (or any thrown value) to the tracker. */
	captureException(err: unknown): void;
	/** Ends the current session. */
	endSession(): void;
	/** Resolves once pending events have been sent, or the sink's timeout passes. */
	flush(): Promise<void>;
}

/** Product analytics — usage, adoption, retention (PostHog). */
export interface AnalyticsSink {
	/** Associates `props` with the person identified by `distinctId`. */
	identify(distinctId: string, props: Record<string, unknown>): void;
	/** Records the `event` for `distinctId` with the given `props`. */
	capture(distinctId: string, event: string, props: Record<string, unknown>): void;
	/** Flushes queued events and shuts the client down. */
	shutdown(): Promise<void>;
}

/**
 * The disabled path made explicit — one shared no-op instead of a scatter of
 * `if (!enabled) return` guards. Install it when telemetry is opted out or no
 * credentials resolve.
 */
export class NoopErrorSink implements ErrorSink {
	/** Does nothing. */
	init(): void {}
	startSpan(): CommandSpan | undefined {
		return undefined;
	}
	/** Does nothing. */
	captureException(): void {}
	/** Does nothing. */
	endSession(): void {}
	/** Resolves immediately. */
	async flush(): Promise<void> {}
}

/** @see NoopErrorSink */
export class NoopAnalyticsSink implements AnalyticsSink {
	/** Does nothing. */
	identify(): void {}
	/** Does nothing. */
	capture(): void {}
	/** Resolves immediately. */
	async shutdown(): Promise<void> {}
}
