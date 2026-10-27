/**
 * Comlink's own config, separate from the monorepo root's (the same arrangement as Sentinel's): it governs where
 * Comlink's secrets live, not how the repo is built.
 *
 *   - `holocron repo setup --cwd apps/comlink` (one-time): creates the Doppler project `comlink` and its
 *     `dev`/`stg`/`prd` configs.
 *   - `holocron secrets sync prd --cwd apps/comlink --worker comlink` (when a secret changes): sets every key in
 *     Doppler's `prd` config on the deployed Worker. The signing secret `COMLINK_SENTRY_SECRET` (the Sentry
 *     integration's client secret) lives there; nothing is pasted into a shell or stored as a repo secret.
 *
 * The Worker itself, its route and the `COMLINK_<SOURCE>_WEBHOOK` secrets are deployed by `holocron notifications
 * setup` from the root config, which is also what creates each channel's webhook.
 */

import { defineConfig } from "@theholocron/cli";

export default defineConfig({
	providers: {
		// Only `sync` needs this one: it sets the Worker's secrets. The account id is not a credential (it is also the
		// org variable CLOUDFLARE_ACCOUNT_ID in the root config).
		workers: ["cloudflare", { accountId: "9c558af98664d13fc89b7e0a0d93d5a8" }],
		vault: ["doppler", { project: "comlink", config: "prd" }],
	},
});
