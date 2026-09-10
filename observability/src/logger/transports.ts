import type { TransportMultiOptions, TransportSingleOptions, TransportTargetOptions } from "pino";

import type { LogLevel } from "../core/logger.js";

/** Axiom credentials. The token comes from env vars or the OS keyring — never
 *  a committed config file; the dataset name may come from config. */
export interface AxiomTransportConfig {
	dataset: string;
	token: string;
}

export interface BuildTransportInput {
	/** Resolved log level — applied uniformly to every transport. */
	level: LogLevel;
	/** Axiom credentials. When absent, no Axiom transport is wired. */
	axiom?: AxiomTransportConfig;
	/** `true` inside CI — suppresses pino-pretty. */
	ci: boolean;
	/** `process.stdout.isTTY` — pino-pretty only makes sense on a TTY. */
	tty: boolean;
	/** `true` when `HOLOCRON_TELEMETRY=false` — suppresses the Axiom transport only. */
	telemetryDisabled: boolean;
}

const prettyTarget = (level: LogLevel): TransportTargetOptions => ({
	target: "pino-pretty",
	level,
	options: {
		colorize: true,
		translateTime: "SYS:HH:MM:ss",
		ignore: "pid,hostname",
	},
});

const stdoutJsonTarget = (level: LogLevel): TransportTargetOptions => ({
	target: "pino/file",
	level,
	options: { destination: 1 },
});

const axiomTarget = (level: LogLevel, axiom: AxiomTransportConfig): TransportTargetOptions => ({
	target: "@axiomhq/pino",
	level,
	options: { dataset: axiom.dataset, token: axiom.token },
});

/**
 * Build the Pino `transport` option for the current environment.
 *
 * | Environment                | Output                                              |
 * | -------------------------- | --------------------------------------------------- |
 * | Local, TTY, no Axiom       | `pino-pretty` only                                  |
 * | CI, no Axiom               | `undefined` — Pino's default NDJSON to stdout       |
 * | Local, TTY, with Axiom     | `pino-pretty` + Axiom                               |
 * | CI, with Axiom             | NDJSON to stdout + Axiom                            |
 *
 * The Axiom transport is dropped entirely when `telemetryDisabled` is set,
 * regardless of whether credentials were supplied. Every transport runs on
 * the same resolved `level` — there is no Axiom-only gate.
 *
 * Returning `undefined` lets `createLogger` fall back to a plain
 * `pino({ ... })` with no worker thread — the cheapest path, and exactly
 * what CI wants.
 */
export function buildTransport(input: BuildTransportInput): TransportSingleOptions | TransportMultiOptions | undefined {
	const { level, axiom, ci, tty, telemetryDisabled } = input;
	const pretty = !ci && tty;

	const targets: TransportTargetOptions[] = [];
	if (pretty) targets.push(prettyTarget(level));
	if (axiom && !telemetryDisabled) targets.push(axiomTarget(level, axiom));

	if (targets.length === 0) return undefined;

	// Keep human-visible console output alive when the only transports are
	// off-console (Axiom in CI, Axiom on a non-TTY local run).
	if (!pretty) targets.unshift(stdoutJsonTarget(level));

	if (targets.length === 1) return targets[0] as TransportSingleOptions;
	return { targets };
}
