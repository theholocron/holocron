import { redact, redactObject } from "../core/redact.js";
import type { CommandSpan, ErrorSink } from "../core/sinks.js";
import { type OnError, safely, safelyAsync } from "./safe.js";

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
	/** The span `op` for {@link ErrorSink.startSpan}. Defaults to `"holocron.command"`, as in the Node `SentrySink`. */
	spanOp?: string;
	/** Whether {@link ErrorSink.init} starts a JS-level release-health session. Defaults to `true`; React Native tracks sessions natively. */
	sessions?: boolean;
	/** Called with each error the sink swallowed from the SDK. Defaults to ignoring them; it can never throw into the app. */
	onError?: OnError;
}

/** Redacts token-shaped strings from an event before it leaves the runtime (Sentry's `beforeSend` and `beforeSendTransaction`). */
export function scrubEvent<T>(event: T): T {
	return redactObject(event);
}

/**
 * An {@link ErrorSink} over any Sentry SDK that has the {@link SentrySdkLike}
 * surface. The runtime classes only choose which package supplies the SDK.
 * Every vendor call is guarded: an SDK that throws is reported to `onError`
 * (when given), never propagated to the application. Errors, transactions,
 * span names and tags are scrubbed of token-shaped strings. It reads no
 * environment; the caller passes the resolved DSN.
 */
export class SentryCompatibleSink implements ErrorSink {
	readonly #sdk: SentrySdkLike;
	readonly #tracesSampleRate: number;
	readonly #flushTimeoutMs: number;
	readonly #spanOp: string;
	readonly #sessions: boolean;
	readonly #onError: OnError | undefined;

	/** Builds the sink around `sdk`. */
	constructor(sdk: SentrySdkLike, options: Omit<SentrySinkOptions, "sdk"> = {}) {
		this.#sdk = sdk;
		this.#tracesSampleRate = options.tracesSampleRate ?? 0.1;
		this.#flushTimeoutMs = options.flushTimeoutMs ?? 2_000;
		this.#spanOp = options.spanOp ?? "holocron.command";
		this.#sessions = options.sessions ?? true;
		this.#onError = options.onError;
	}

	/** Initialises the SDK with the DSN, release and environment, starts a session when the runtime has one and applies `ctx.tags`. */
	init(ctx: { dsn: string; release: string; environment: string; tags: Record<string, string> }): void {
		safely(
			() =>
				this.#sdk.init({
					dsn: ctx.dsn,
					release: ctx.release,
					environment: ctx.environment,
					tracesSampleRate: this.#tracesSampleRate,
					beforeSend: scrubEvent,
					beforeSendTransaction: scrubEvent,
				}),
			this.#onError,
			"sentry.init"
		);
		if (this.#sessions) safely(() => this.#sdk.startSession?.(), this.#onError, "sentry.startSession");
		for (const [key, value] of Object.entries(ctx.tags)) {
			safely(() => this.#sdk.setTag(redact(key), redact(value)), this.#onError, "sentry.setTag");
		}
	}

	/** Tags the scope with the command and starts a span named `name` (both scrubbed); its methods never throw, and do nothing when the SDK could not start one. */
	startSpan(name: string): CommandSpan {
		const safeName = redact(name);
		safely(() => this.#sdk.setTag("command", safeName), this.#onError, "sentry.setTag");
		const span = safely(
			() => this.#sdk.startInactiveSpan({ name: safeName, op: this.#spanOp, forceTransaction: true }),
			this.#onError,
			"sentry.startInactiveSpan"
		);
		return {
			setStatus: (ok) =>
				void safely(() => span?.setStatus({ code: ok ? 1 : 2 }), this.#onError, "sentry.span.setStatus"),
			end: () => void safely(() => span?.end(), this.#onError, "sentry.span.end"),
		};
	}

	/** Reports `err`; a throw from the SDK goes to `onError`. */
	captureException(err: unknown): void {
		safely(() => this.#sdk.captureException(err), this.#onError, "sentry.captureException");
	}

	/** Ends the session, when the runtime has one. */
	endSession(): void {
		if (this.#sessions) safely(() => this.#sdk.endSession?.(), this.#onError, "sentry.endSession");
	}

	/** Waits for pending events for up to the flush timeout; never rejects. */
	async flush(): Promise<void> {
		await safelyAsync(() => this.#sdk.flush(this.#flushTimeoutMs), this.#onError, "sentry.flush");
	}
}
