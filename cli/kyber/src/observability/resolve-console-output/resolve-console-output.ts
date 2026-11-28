import { isCI } from "@theholocron/observability/logger";

import type { LogFlags } from "../create-cli-logger/create-cli-logger.type.js";

/**
 * Resolve whether human-visible console output (pretty or NDJSON) should run
 * at all, independent of level: the `@theholocron/observability`
 * `consoleOutput` override.
 *
 * Local and interactive runs are quiet by default: structured logger output
 * stays off regardless of level, unless the user asked to see it with
 * `--log <level>`, `--verbose` or `--quiet`. In CI it returns `undefined`,
 * which keeps `createLogger`'s own `ci`/`tty` auto-detection untouched.
 *
 * @param argv - The parsed global logging flags.
 */
export function resolveConsoleOutput(argv: LogFlags): boolean | undefined {
	if (argv.log || argv.verbose || argv.quiet) return true;
	return isCI() ? undefined : false;
}
