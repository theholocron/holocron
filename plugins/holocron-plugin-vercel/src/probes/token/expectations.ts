import type { TokenExpectation } from "@theholocron/cli";

/**
 * Where the Vercel token is held: a laptop (`local`, `dev`) and CI. A Vercel token has no per-endpoint scope (a personal
 * access token's "Full Account" or team scope is a setting, not something the API answers), so the only thing the probe
 * can prove is what the token can reach. `webhooks` is the one permission declared: a laptop token makes the team's
 * Comlink relay webhook (`setup notifications`, `POST /v1/webhooks`), and the probe proves it only as far as `GET
 * /v1/webhooks` answers (a read proves the token sees the team's webhooks, not that it may make one). `ci` holds the
 * token with no rule: nothing in CI makes a webhook, but Vercel cannot take the permission off a token, so it is not
 * declared `absent` (the probe would have nothing to prove it with). This is the plugin's `tokens` declaration, read
 * through `tokenExpectations()`; change it and the Vercel table in `docs/src/content/docs/tokens.mdx` together.
 */
export const EXPECTED: TokenExpectation = {
	layers: ["local", "dev", "ci"],
	permissions: { local: { webhooks: "required" }, dev: { webhooks: "required" } },
};
