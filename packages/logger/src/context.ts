import { randomUUID } from "node:crypto";

import { LOG_LEVELS, type LogEnv, type LogLevel } from "./interface.js";

/**
 * A fresh correlation id for one command invocation. Every log line from a
 * single `holocron` run carries this `runId`, so a whole run can be pulled
 * back out of Axiom with one query.
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
 * 1. `explicit` — already-resolved CLI flag (`--verbose` → `debug`,
 *    `--quiet` → `error`) or `holocron.config` `log.level`, passed by the
 *    command layer.
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
