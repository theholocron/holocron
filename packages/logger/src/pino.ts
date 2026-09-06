import pino, { type DestinationStream, type Logger as PinoInstance, type LoggerOptions } from "pino";

import type { Logger, LogLevel } from "./interface.js";
import { redactOptions } from "./redact.js";
import { type AxiomTransportConfig, buildTransport } from "./transports.js";

/**
 * The one concrete {@link Logger}. Nothing outside this package should name
 * it — construct loggers with `createLogger`. It is a thin pass-through to a
 * Pino instance; the interface overloads mirror Pino's own, so each method is
 * a single delegated call.
 */
export class PinoLogger implements Logger {
	readonly #pino: PinoInstance;

	constructor(instance: PinoInstance) {
		this.#pino = instance;
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
		return new PinoLogger(this.#pino.child(bindings));
	}

	#emit(level: LogLevel, objOrMsg: Record<string, unknown> | string, msg?: string): void {
		if (typeof objOrMsg === "string") this.#pino[level](objOrMsg);
		else this.#pino[level](objOrMsg, msg);
	}
}

export interface CreatePinoInstanceInput {
	/** Resolved log level. */
	level: LogLevel;
	/** Axiom credentials, if the transport should be wired. */
	axiom?: AxiomTransportConfig;
	/** `true` inside CI. */
	ci: boolean;
	/** `process.stdout.isTTY`. */
	tty: boolean;
	/** `true` when `HOLOCRON_TELEMETRY=false`. */
	telemetryDisabled: boolean;
	/** Bindings written on every line — `runId` and `env`. */
	base: Record<string, unknown>;
	/**
	 * Write here instead of configuring transports. Used by tests to capture
	 * output synchronously; never set in production.
	 */
	destination?: DestinationStream;
}

/**
 * Construct the underlying Pino instance: resolved level, sensitive-field
 * redaction, ISO timestamps, and `runId` / `env` on every line. Transports
 * come from {@link buildTransport} unless a `destination` stream is supplied.
 */
export function createPinoInstance(input: CreatePinoInstanceInput): PinoInstance {
	const options: LoggerOptions = {
		level: input.level,
		base: input.base,
		timestamp: pino.stdTimeFunctions.isoTime,
		redact: { paths: [...redactOptions.paths], censor: redactOptions.censor },
	};

	if (input.destination) return pino(options, input.destination);

	const transport = buildTransport(input);
	return transport ? pino({ ...options, transport }) : pino(options);
}
