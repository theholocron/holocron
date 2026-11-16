import type { TokenExpectation } from "@theholocron/cli";

/**
 * Where the Codecov token is held: CI only (`measure:bundle` uploads bundle stats with it), so `ci` is the one layer
 * declared. Codecov has one token that does one thing, upload, and no permission model, so no permissions are declared and
 * the probe says so instead of guessing. This is the plugin's `tokens` declaration, read through `tokenExpectations()`;
 * change it and the Codecov row in `docs/src/content/docs/tokens.mdx` together.
 */
export const EXPECTED: TokenExpectation = { layers: ["ci"] };

/**
 * Where the Codecov API token (a personal access token, read by `probe codecov repo`) is held: `ci` only, like the upload
 * token, so a scheduled run can compare the repository's flags and components. It has no permission model to declare
 * either. Change it and the Codecov API row in `tokens.mdx` together.
 */
export const API_EXPECTED: TokenExpectation = { layers: ["ci"] };
