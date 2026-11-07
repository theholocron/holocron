import { createEnvLookup } from "@theholocron/env-utils/lookup";

/**
 * The Codecov upload token the bundle-analysis plugin uses, read through `@theholocron/env-utils/lookup` rather than
 * `process.env`.
 *
 * @param env - The environment to read. Default `process.env`, read when called; a test passes its own.
 * @returns The `CODECOV_TOKEN` value, or `undefined` when it is unset or empty.
 */
export function codecovToken(env?: Record<string, string | undefined>): string | undefined {
	return createEnvLookup(env).get("CODECOV_TOKEN");
}
