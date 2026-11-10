import { redactObject } from "../core/redact.js";
import type { CommandSpan, ErrorSink } from "../core/sinks.js";
import { safely, safelyAsync } from "./safe.js";

/** The slice of a Sentry SDK namespace (`@sentry/browser`, `@sentry/vercel-edge`, ...) that {@link SentryCompatibleSink} calls. */
export interface SentrySdkLike {
	/** Initialises the SDK. */
	init(options: Record<string, unknown>): unknown;
	/** Sets a tag on every later event. */
	setTag(key: string, value: string): unknown;
	/** Reports an error. */
	captureException(err: unknown): unknown;
	/** Starts a span that is not made active. */
	startInactiveSpan(options: { name: string; op: string; forceTransaction: boolean }): {
		setStatus(status: { code: number }): unknown;
		end(): unknown;
	};
	/** Sends queued events, resolving once done or after `timeout` milliseconds. */
	flush(timeout?: number): PromiseLike<unknown>;
	/** Starts a release-health session (absent on runtimes with no sessions). */
	startSession?(): unknown;
	/** Ends the release-health session (absent on runtimes with no sessions). */
	endSession?(): unknown;
}

/** Options shared by the Sentry-compatible sinks. */
export interface SentrySinkOptions {
	/** The SDK to call. Defaults to the runtime's own package; pass a fake in a test. */
	sdk?: SentrySdkLike;
	/** Share of transactions to sample, 0 to 1. Defaults to `0.1`. */
	tracesSampleRate?: number;
	/** Milliseconds {@link ErrorSink.flush} waits for pending events. Defaults to `2000`. */
	flushTimeoutMs?: number;
	/** The span `op` for {@link ErrorSink.startSpan}. Defaults to `"app.command"`. */
	spanOp?: string;
}

/** Redacts token-shaped strings from an event before it leaves the runtime (Sentry's `beforeSend`). */
export function scrubEvent<T>(event: T): T {
	return redactObject(event);
}

/**
 * An {@link ErrorSink} over any Sentry SDK that has the {@link SentrySdkLike}
 * surface. The runtime classes only choose which package supplies the SDK.
 * Every vendor call is guarded: an SDK that throws is ignored, never
 * propagated to the application. It reads no environment; the caller passes
 * the resolved DSN.
 */
export class SentryCompatibleSink implements ErrorSink {
	readonly #sdk: SentrySdkLike;
	readonly #tracesSampleRate: number;
	readonly #flushTimeoutMs: number;
	readonly #spanOp: string;

	/** Builds the sink around `sdk`. */
	constructor(sdk: SentrySdkLike, options: Omit<SentrySinkOptions, "sdk"> = {}) {
		this.#sdk = sdk;
		this.#tracesSampleRate = options.tracesSampleRate ?? 0.1;
		this.#flushTimeoutMs = options.flushTimeoutMs ?? 2_000;
		this.#spanOp = options.spanOp ?? "app.command";
	}

	/** Initialises the SDK with the DSN, release and environment, starts a session when the runtime has one and applies `ctx.tags`. */
	init(ctx: { dsn: string; release: string; environment: string; tags: Record<string, string> }): void {
		safely(() =>
			this.#sdk.init({
				dsn: ctx.dsn,
				release: ctx.release,
				environment: ctx.environment,
				tracesSampleRate: this.#tracesSampleRate,
				beforeSend: scrubEvent,
			})
		);
		safely(() => this.#sdk.startSession?.());
		for (const [key, value] of Object.entries(ctx.tags)) safely(() => this.#sdk.setTag(key, value));
	}

	/** Starts a span named `name`; its methods never throw, and do nothing when the SDK could not start one. */
	startSpan(name: string): CommandSpan {
		const span = safely(() => this.#sdk.startInactiveSpan({ name, op: this.#spanOp, forceTransaction: true }));
		return {
			setStatus: (ok) => void safely(() => span?.setStatus({ code: ok ? 1 : 2 })),
			end: () => void safely(() => span?.end()),
		};
	}

	/** Reports `err`; a throw from the SDK is ignored. */
	captureException(err: unknown): void {
		safely(() => this.#sdk.captureException(err));
	}

	/** Ends the session, when the runtime has one. */
	endSession(): void {
		safely(() => this.#sdk.endSession?.());
	}

	/** Waits for pending events for up to the flush timeout; never rejects. */
	async flush(): Promise<void> {
		await safelyAsync(() => this.#sdk.flush(this.#flushTimeoutMs));
	}
}
