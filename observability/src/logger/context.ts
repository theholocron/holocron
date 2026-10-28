import { randomUUID } from "node:crypto";

import { LOG_LEVELS, type LogEnv, type LogLevel } from "../core/logger.js";
import type { AxiomTransportConfig } from "./transports.js";

/**
 * A fresh correlation id for one invocation. Every log line from a single run
 * carries this `runId`, so a whole run can be pulled back out of Axiom with
 * one query.
 */
export function generateRunId(): string {
	return randomUUID();
}

/**
 * True when running inside CI. GitHub Actions (and most other providers) set
 * `CI=true`; we also accept any other non-empty, non-`false` value.
 */
export function isCI(env: NodeJS.ProcessEnv = process.env): boolean {
	const ci = env.CI;
	if (!ci) return false;
	return ci !== "false" && ci !== "0";
}

/** `"ci"` inside CI, otherwise `"local"` — bound on every root logger. */
export function detectEnv(env: NodeJS.ProcessEnv = process.env): LogEnv {
	return isCI(env) ? "ci" : "local";
}

/** Narrow an arbitrary string to a {@link LogLevel}, or `undefined`. */
export function parseLogLevel(value: string | undefined): LogLevel | undefined {
	return value && (LOG_LEVELS as readonly string[]).includes(value) ? (value as LogLevel) : undefined;
}

/**
 * Resolve the effective log level in priority order:
 *
 * 1. `explicit` — an already-resolved level (a CLI flag, a config field)
 *    passed by the caller.
 * 2. `HOLOCRON_LOG_LEVEL` env var.
 * 3. `"info"` default.
 *
 * An unrecognised value at any tier is ignored and resolution falls through.
 */
export function resolveLevel(explicit?: LogLevel, env: NodeJS.ProcessEnv = process.env): LogLevel {
	return explicit ?? parseLogLevel(env.HOLOCRON_LOG_LEVEL) ?? "info";
}

/** True when the Axiom transport must be suppressed via `HOLOCRON_TELEMETRY=false`. */
export function isTelemetryDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return env.HOLOCRON_TELEMETRY === "false";
}

/**
 * Resolve Axiom credentials from the environment — the canonical fallback
 * chain from ADR-0007. `createLogger` calls this when no explicit
 * `config.axiom` is supplied, so every consumer gets Axiom activation from env
 * vars alone. Credentials are read here and only here — never from a config
 * file.
 *
 * Returns `undefined` unless BOTH a token and a dataset are present.
 *
 * | Value    | Primary                  | Fallback        |
 * | -------- | ------------------------ | --------------- |
 * | token    | `HOLOCRON_AXIOM_TOKEN`   | `AXIOM_TOKEN`   |
 * | dataset  | `HOLOCRON_AXIOM_DATASET` | `AXIOM_DATASET` |
 */
export function resolveAxiomFromEnv(env: NodeJS.ProcessEnv = process.env): AxiomTransportConfig | undefined {
	const token = env.HOLOCRON_AXIOM_TOKEN ?? env.AXIOM_TOKEN;
	const dataset = env.HOLOCRON_AXIOM_DATASET ?? env.AXIOM_DATASET;
	return token && dataset ? { token, dataset } : undefined;
}
