/**
 * The logging surface every consumer depends on.
 *
 * Call sites import `Logger` — never Pino directly. The concrete implementation
 * ({@link PinoLogger}, or the zero-dep `ConsoleLogger`) is hidden behind this
 * interface so the logging library can be swapped without touching a single
 * call site.
 *
 * The overloads mirror Pino's native API: pass a context object first for
 * structured logging (`log.info({ repo }, "sync complete")`) or a bare string
 * for a simple line (`log.info("sync complete")`).
 */
export interface Logger {
	debug(obj: Record<string, unknown>, msg?: string): void;
	debug(msg: string): void;
	info(obj: Record<string, unknown>, msg?: string): void;
	info(msg: string): void;
	warn(obj: Record<string, unknown>, msg?: string): void;
	warn(msg: string): void;
	error(obj: Record<string, unknown>, msg?: string): void;
	error(msg: string): void;
	/**
	 * Derive a child logger that inherits every binding from its parent and
	 * adds its own. Used to attach per-module context (`module`, `repo`, …)
	 * without threading extra fields through every call.
	 */
	child(bindings: Record<string, unknown>): Logger;
	/**
	 * Resolve once every line logged so far has actually left the process.
	 *
	 * Matters specifically for a worker-thread transport (Axiom): the call
	 * that enqueues a line returns before that line reaches the network — the
	 * worker thread needs its own event-loop turn to flush the batch over
	 * HTTP. A short-lived process (a serverless function returning its
	 * response) can exit before that turn happens, silently dropping every
	 * buffered line. Call this before returning from such a handler; a
	 * synchronous sink (`ConsoleLogger`, `NoopLogger`, plain stdout NDJSON
	 * with no transport) has nothing to wait for and resolves immediately.
	 */
	flush(): Promise<void>;
}

/** Log levels, ordered least to most severe. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** The four levels, in ascending severity — useful for validation. */
export const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

/** Runtime environment a logger was constructed in. */
export type LogEnv = "ci" | "local";

/**
 * The disabled-logging path made explicit — one shared no-op instead of a
 * scatter of `if (!enabled) return` guards at every call site. Symmetric with
 * {@link NoopErrorSink} / {@link NoopAnalyticsSink} in `./sinks.js`. `child()`
 * returns `this` — a whole tree of child loggers collapses to one instance.
 *
 * Use it for the opted-out path, for non-vitest tests/examples that need a
 * `Logger` but no output, or anywhere else a real transport is not worth the
 * dependency. Vitest-based test doubles (`fakeLogger`, which records calls
 * instead of discarding them) live in `@theholocron/observability/testing`.
 */
export class NoopLogger implements Logger {
	debug(_objOrMsg?: Record<string, unknown> | string, _msg?: string): void {}
	info(_objOrMsg?: Record<string, unknown> | string, _msg?: string): void {}
	warn(_objOrMsg?: Record<string, unknown> | string, _msg?: string): void {}
	error(_objOrMsg?: Record<string, unknown> | string, _msg?: string): void {}
	child(_bindings?: Record<string, unknown>): Logger {
		return this;
	}
	flush(): Promise<void> {
		return Promise.resolve();
	}
}
