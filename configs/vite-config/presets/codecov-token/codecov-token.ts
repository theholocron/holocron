import { holocronEnv } from "@theholocron/env-utils/lookup";

/**
 * The Codecov upload token the bundle-analysis plugin uses, read through `@theholocron/env-utils/lookup` rather than
 * `process.env`. `HOLOCRON_CODECOV_TOKEN` wins; the bare `CODECOV_TOKEN` (the name the Codecov uploader reads itself) is
 * the fallback.
 *
 * @param env - The environment to read. Default `process.env`, read when called; a test passes its own.
 * @returns The `HOLOCRON_CODECOV_TOKEN` or `CODECOV_TOKEN` value, or `undefined` when neither is set or both are empty.
 */
export function codecovToken(env?: Record<string, string | undefined>): string | undefined {
	return holocronEnv(env).get("CODECOV_TOKEN");
}
