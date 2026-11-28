import { createEnvLookup } from "@theholocron/env-utils/lookup";
import type { LogLevel } from "@theholocron/observability/core";
import { parseLogLevel } from "@theholocron/observability/logger";

import type { LogFlags } from "../create-cli-logger/create-cli-logger.type.js";

const env = createEnvLookup();

/**
 * Resolve the explicit level to hand to `createLogger`, in priority order:
 *
 * 1. `--log <level>`           2. `--verbose` → `"debug"`   3. `--quiet` → `"error"`
 * 4. `<PREFIX>_LOG_LEVEL` env var
 * 5. the config file's log level (`configLevel`)
 *
 * Returns `undefined` when nothing applies, so `createLogger` falls back to
 * `"info"`. Resolving the whole chain here (rather than passing `configLevel`
 * straight through) keeps config below the env var.
 *
 * @param envPrefix - Upper-case env prefix of the CLI, e.g. `"HOLOCRON"`.
 * @param argv - The parsed global logging flags.
 * @param configLevel - The level from the CLI's config file, if one was loaded.
 */
export function resolveLogLevel(envPrefix: string, argv: LogFlags, configLevel?: LogLevel): LogLevel | undefined {
	if (argv.log) return argv.log;
	if (argv.verbose) return "debug";
	if (argv.quiet) return "error";
	return parseLogLevel(env.get(`${envPrefix}_LOG_LEVEL`)) ?? configLevel;
}
