/**
 * Comlink's own config, separate from the monorepo root's (the same arrangement as Sentinel's): it governs where
 * Comlink's secrets live, not how the repo is built.
 *
 *   - The 1Password Environment `Comlink` (made by hand: `op` cannot create one) holds the signing secret
 *     `COMLINK_SENTRY_SECRET` (the Sentry integration's client secret).
 *   - `holocron secrets sync Comlink --cwd apps/comlink --worker comlink` (when a secret changes): sets the `COMLINK_` keys of
 *     that Environment on the deployed Worker (`repo.secrets.deploy` below; any other key stays in the Environment). Nothing is pasted into a shell or stored as a repo secret.
 *
 * The Worker itself, its route and the `COMLINK_<SOURCE>_WEBHOOK` secrets are deployed by `holocron notifications
 * setup` from the root config, which is also what creates each channel's webhook.
 */

import { defineConfig } from "@theholocron/cli";

export default defineConfig({
	repo: {
		secrets: {
			// The Worker receives only the `COMLINK_` names (#2061); with no entry the sync stops with a ConfigError.
			deploy: [{ environment: "Comlink", prefix: "COMLINK_" }],
		},
	},
	providers: {
		// Only `sync` needs this one: it sets the Worker's secrets. It has no `accountId`: the plugin reads
		// CLOUDFLARE_ACCOUNT_ID through the credential chain, from the Environment named in `credentials` below.
		workers: "cloudflare",
		// This machine's own tokens (the Cloudflare one `workers` uses) are in the `Holocron` Environment, ahead of the
		// keyring, as in the root config; a config that names only the second one leaves them to the keyring when run from
		// here. The org's non-secret values (CLOUDFLARE_ACCOUNT_ID) are in the second (#1827).
		credentials: [
			["1password", { environment: "Holocron" }],
			["1password", { environment: "Holocron - GitHub Actions variables" }],
		],
		vault: ["1password", { environment: "Comlink" }],
	},
});
