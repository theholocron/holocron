import { createEnvLookup } from "@theholocron/env-utils";

export type { EnvLookup as CliEnv } from "@theholocron/env-utils";

/** Singleton env for simple global lookups throughout the CLI. */
export const env = createEnvLookup();

/**
 * Create an injectable env for commands that accept a fake env in tests.
 * Pass `input.env` when available, falls back to `process.env`.
 */
export function makeEnv(source?: Record<string, string | undefined>) {
	return createEnvLookup(source);
}
