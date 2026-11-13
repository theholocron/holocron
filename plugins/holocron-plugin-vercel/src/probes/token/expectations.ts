import type { TokenExpectation } from "@theholocron/cli";

/**
 * Where the Vercel token is held: a laptop (`local`, `dev`) and CI. Vercel does not report a token's scope (a personal
 * access token's "Full Account" is a setting, not something the API answers), so no permissions are declared and the
 * probe says so instead of guessing. This is the plugin's `tokens` declaration, read through `tokenExpectations()`;
 * change it and the Vercel note in `docs/src/content/docs/tokens.mdx` together.
 */
export const EXPECTED: TokenExpectation = { layers: ["local", "dev", "ci"] };
