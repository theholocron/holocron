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
}

/** Log levels, ordered least to most severe. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** The four levels, in ascending severity — useful for validation. */
export const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

/** Runtime environment a logger was constructed in. */
export type LogEnv = "ci" | "local";
