import { createEnvLookup } from "@theholocron/env-utils/lookup";

const env = createEnvLookup();

/**
 * Resolves the active org in priority order:
 *   1. `--org` CLI flag
 *   2. `HOLOCRON_ORG` env var
 *   3. `org` from `holocron.config.ts`
 */
export function resolveOrg(argv: { org?: string }, config: { org?: string }): string | undefined {
	return argv.org ?? env.get("HOLOCRON_ORG") ?? config.org;
}
