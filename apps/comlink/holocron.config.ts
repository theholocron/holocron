/**
 * Comlink's own config, separate from the monorepo root's (the same arrangement as Sentinel's): it governs where
 * Comlink's secrets live, not how the repo is built.
 *
 *   - The `prod` layer's 1Password Environment (`<org/repo> - prod`, made by hand: `op` cannot create one) holds the
 *     signing secret `COMLINK_SENTRY_SECRET` (the Sentry integration's client secret).
 *   - `holocron sync secrets --env prod --cwd apps/comlink --worker comlink` (when a secret changes): sets the `COMLINK_` keys of
 *     that Environment on the deployed Worker (`repo.secrets.deploy` below; any other key stays in the Environment). Nothing is pasted into a shell or stored as a repo secret.
 *
 * The Worker itself, its route and the `COMLINK_<SOURCE>_WEBHOOK` secrets are deployed by `holocron notifications
 * setup` from the root config, which is also what creates each channel's webhook.
 */

import { defineConfig } from "@theholocron/cli";

import org from "../../.holocron/org.js";

// The zone is spelled once, in the repo root's `.holocron/org.ts` (the same import `apps/sentinel` makes). The loader
// also sets `domain` on this config from the shared org area, so it is not written below.
const relayUrl = `https://comlink.${org.domain}/sentry`;

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
		// The requests for sending a delivery by hand, beside `src/worker.ts` (#2172): `holocron sync tooling --cwd apps/comlink`
		// pushes them to the `Holocron` workspace (made when absent; every app is a collection in it). The environment's
		// `sentrySecret` is committed empty and keeps the value set there.
		tooling: [
			[
				"postman",
				{
					workspace: "Holocron",
					collectionFiles: ["src/worker.collection.json"],
					envFiles: ["src/worker.environment.json"],
				},
			],
			// Bruno reads files, not an account: `holocron export requests --to bruno` writes the same collection as
			// a Bruno JSON file into the git-ignored `src/.export/bruno/`.
			[
				"bruno",
				{
					collectionFiles: ["src/worker.collection.json"],
					envFiles: ["src/worker.environment.json"],
				},
			],
		],
		// Two checks watch the relay from outside Cloudflare (#2302), the same pair Sentinel has. Both expect an error
		// status, so `shouldFail` is set (see apps/sentinel/holocron.config.ts). The answers are the ones the README
		// documents ("Rejected": a GET is 405, an unsigned POST is 401); the GET was confirmed with a read-only request,
		// and the unsigned POST was not sent to the live Worker, the README is trusted for it. `accountId` is filled from
		// the shared org area, as for Sentinel.
		monitoring: [
			"checkly",
			{
				checks: [
					{
						name: "Comlink relay uptime",
						url: relayUrl,
						method: "GET",
						locations: ["us-east-1"],
						tags: ["comlink"],
						shouldFail: true,
						assertions: [{ source: "status_code", comparison: "equals", target: "405" }],
					},
					{
						name: "Comlink relay signature verification",
						url: relayUrl,
						method: "POST",
						locations: ["us-east-1"],
						tags: ["comlink"],
						shouldFail: true,
						body: "{}",
						assertions: [{ source: "status_code", comparison: "equals", target: "401" }],
					},
				],
			},
		],
		// This machine's own tokens (the Cloudflare one `workers` uses, and CLOUDFLARE_ACCOUNT_ID) come from the
		// Environment of this machine's layer, derived from the repository's remote (#2063), ahead of the keyring.
		credentials: ["1password"],
		// The production values of Comlink, in the `prod` layer (#2069): `holocron sync secrets --env prod`.
		vault: ["1password", { layer: "prod" }],
	},
});
