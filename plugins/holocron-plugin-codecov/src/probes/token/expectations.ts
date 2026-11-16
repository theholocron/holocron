import type { TokenExpectation } from "@theholocron/cli";

/**
 * Where the Codecov upload token (`HOLOCRON_CODECOV_UPLOAD_TOKEN`) is held: CI only (`measure:bundle` uploads bundle stats
 * with it), so `ci` is the one layer declared. Codecov has no permission model, so no permissions are declared and
 * the probe says so instead of guessing. This is the plugin's `tokens` declaration, read through `tokenExpectations()`;
 * change it and the Codecov row in `docs/src/content/docs/tokens.mdx` together.
 */
export const EXPECTED: TokenExpectation = { layers: ["ci"] };

/**
 * Where the Codecov API token (`HOLOCRON_CODECOV_API_TOKEN`, a personal access token, read by `probe codecov repo`) is
 * held: `dev` and `ci`, in 1Password only (nothing syncs it to GitHub). It has no permission model to declare either. Change it and the Codecov API row in `tokens.mdx` together.
 */
export const API_EXPECTED: TokenExpectation = { layers: ["dev", "ci"] };
