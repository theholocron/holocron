import type { Logger, LogLevel } from "../core/logger.js";

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SINK: Record<LogLevel, (...args: unknown[]) => void> = {
	debug: (...a) => console.debug(...a),
	info: (...a) => console.info(...a),
	warn: (...a) => console.warn(...a),
	error: (...a) => console.error(...a),
};

/**
 * A zero-dependency {@link Logger} over the platform `console` — no Pino, no
 * worker thread, no transports. Use it in the browser, an edge runtime, or
 * React Native, or anywhere the Pino weight is not worth it. Structured calls
 * are emitted as `(message, contextObject)`; `child()` bindings are merged into
 * every line's context.
 *
 * There is no Axiom shipping here — that is a Node-transport concern. A
 * `ConsoleLogger` is for local visibility only.
 */
export class ConsoleLogger implements Logger {
	readonly #level: number;
	readonly #bindings: Record<string, unknown>;

	constructor(options: { level?: LogLevel; bindings?: Record<string, unknown> } = {}) {
		this.#level = RANK[options.level ?? "info"];
		this.#bindings = options.bindings ?? {};
	}

	debug(obj: Record<string, unknown>, msg?: string): void;
	debug(msg: string): void;
	debug(objOrMsg: Record<string, unknown> | string, msg?: string): void {
		this.#emit("debug", objOrMsg, msg);
	}

	info(obj: Record<string, unknown>, msg?: string): void;
	info(msg: string): void;
	info(objOrMsg: Record<string, unknown> | string, msg?: string): void {
		this.#emit("info", objOrMsg, msg);
	}

	warn(obj: Record<string, unknown>, msg?: string): void;
	warn(msg: string): void;
	warn(objOrMsg: Record<string, unknown> | string, msg?: string): void {
		this.#emit("warn", objOrMsg, msg);
	}

	error(obj: Record<string, unknown>, msg?: string): void;
	error(msg: string): void;
	error(objOrMsg: Record<string, unknown> | string, msg?: string): void {
		this.#emit("error", objOrMsg, msg);
	}

	child(bindings: Record<string, unknown>): Logger {
		return new ConsoleLogger({
			level: (Object.keys(RANK) as LogLevel[]).find((l) => RANK[l] === this.#level),
			bindings: { ...this.#bindings, ...bindings },
		});
	}

	#emit(level: LogLevel, objOrMsg: Record<string, unknown> | string, msg?: string): void {
		if (RANK[level] < this.#level) return;

		if (typeof objOrMsg === "string") {
			if (Object.keys(this.#bindings).length) SINK[level](objOrMsg, this.#bindings);
			else SINK[level](objOrMsg);
			return;
		}

		const ctx = { ...this.#bindings, ...objOrMsg };
		if (msg) SINK[level](msg, ctx);
		else SINK[level](ctx);
	}
}
