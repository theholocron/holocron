import type { TokenExpectation } from "@theholocron/cli";

/**
 * Where the Fern token is held: CI only (the `publish-wiki` workflow), so `ci` is the one layer declared. Fern has no
 * endpoint that reports a token's permissions, so none are declared and the probe says so instead of guessing. This is
 * the plugin's `tokens` declaration, read through `tokenExpectations()`; change it and the Fern note in
 * `docs/src/content/docs/tokens.mdx` together.
 */
export const EXPECTED: TokenExpectation = { layers: ["ci"] };
