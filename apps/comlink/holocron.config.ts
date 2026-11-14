/**
 * Comlink's own config, separate from the monorepo root's (the same arrangement as Sentinel's): it governs where
 * Comlink's secrets live, not how the repo is built.
 *
 *   - The 1Password Environment `Comlink` (made by hand: `op` cannot create one) holds the signing secret
 *     `COMLINK_SENTRY_SECRET` (the Sentry integration's client secret).
 *   - `holocron sync secrets --env Comlink --cwd apps/comlink --worker comlink` (when a secret changes): sets the `COMLINK_` keys of
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
			deploy: [{ layer: "prod", prefix: "COMLINK_" }],
		},
	},
	providers: {
		// Only `sync` needs this one: it sets the Worker's secrets. It has no `accountId`: the plugin reads
		// CLOUDFLARE_ACCOUNT_ID through the credential chain, from the Environment named in `credentials` below.
		workers: "cloudflare",
		// The requests for sending a delivery by hand, `requests/` (#2172): `holocron setup --cwd apps/comlink` pushes
		// them to the `Holocron` workspace (made when absent; every app is a collection in it). The environment's
		// `sentrySecret` is committed empty and keeps the value set there.
		tooling: [
			[
				"postman",
				{
					workspace: "Holocron",
					collectionFiles: ["requests/collection.json"],
					envFiles: ["requests/environment.json"],
				},
			],
			// Bruno reads files, not an account: `holocron export requests --to bruno` writes the same collection as
			// OpenCollection YAML into the git-ignored `requests/.export/bruno/`.
			[
				"bruno",
				{
					collectionFiles: ["requests/collection.json"],
					envFiles: ["requests/environment.json"],
				},
			],
		],
		// This machine's own tokens (the Cloudflare one `workers` uses, and CLOUDFLARE_ACCOUNT_ID) come from the
		// Environment of this machine's layer, derived from the repository's remote (#2063), ahead of the keyring.
		credentials: ["1password"],
		// The production values of Comlink, in the `prod` layer (#2069): `holocron sync secrets --env prod`.
		vault: ["1password", { layer: "prod" }],
	},
});
