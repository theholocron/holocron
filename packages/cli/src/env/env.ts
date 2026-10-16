import { createEnvLookup, withEnvPrefix } from "@theholocron/env-utils";

export type { EnvLookup as CliEnv } from "@theholocron/env-utils";

/** Singleton env for simple global lookups throughout the CLI. */
export const env = createEnvLookup();

/**
 * `get("KEY")` tries `HOLOCRON_KEY` first, then `KEY`. Use it for settings that
 * have both a Holocron-namespaced override and a vendor-native name; do not use
 * it for `HOLOCRON_*` variables that have no bare fallback (`HOLOCRON_ORG`,
 * `HOLOCRON_LOG_LEVEL`, …), where the bare name would be wrong.
 */
export const holocronEnv = withEnvPrefix(env, "HOLOCRON");

/**
 * Create an injectable env for commands that accept a fake env in tests.
 * Pass `input.env` when available, falls back to `process.env`.
 */
export function makeEnv(source?: Record<string, string | undefined>) {
	return createEnvLookup(source);
}
