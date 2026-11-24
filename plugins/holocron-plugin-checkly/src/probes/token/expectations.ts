import type { TokenExpectation } from "@theholocron/cli";

/**
 * Where the Checkly API key (`HOLOCRON_CHECKLY_TOKEN`) is held and checked: `ci`, where the `sync-incidents` task
 * reads the status pages' incidents with it. Checkly reports neither a key's role nor its scope (a user key inherits
 * its user's role, a service key has one chosen at creation: Read Only, Read & Write or Admin), so no permissions are
 * declared and the probe says so instead of guessing. This is the plugin's `tokens` declaration, read through
 * `tokenExpectations()`; change it and the Checkly row in `docs/src/content/docs/tokens.mdx` together.
 */
export const EXPECTED: TokenExpectation = { layers: ["ci"] };
