import type { TokenExpectation } from "@theholocron/cli";

/**
 * Where the Turbo remote-cache token is held: CI only. `dev` holds none today; when one is added, `dev` and `local` are
 * added here (one change) and a layer that holds the token without being declared fails the check. The token is a
 * Vercel token and Vercel does not report a token's scope, so no permissions are declared and the probe says so
 * instead of guessing. This is the plugin's `tokens` declaration, read through `tokenExpectations()`; change it and the
 * Turbo row in `docs/src/content/docs/tokens.mdx` together.
 */
export const EXPECTED: TokenExpectation = { layers: ["ci"] };
