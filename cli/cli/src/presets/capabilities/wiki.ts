import type { Capability } from "../../config/compose/index.js";

/**
 * Adds the Fern engineering wiki (wiki.theholocron.dev/<repo>) to a repo.
 * Provisions docs/wiki/{decisions,standards,specifications}/ and wires the
 * wiki CI workflow to publish on push to main.
 *
 * Compose with docsPreset() for repos that have engineering content to publish:
 *
 * ```ts
 * const preset = compose(docsPreset(), wiki());
 * ```
 */
export function wiki(): Capability {
	return {
		id: "wiki",
		providers: {
			wiki: ["fern", { domain: "wiki.theholocron.dev", fernOrg: "holocron" }],
			// The Cloudflare account id comes from the credential chain (CLOUDFLARE_ACCOUNT_ID), not from a literal (#1827).
			workers: "cloudflare",
		},
		tasks: ["publish-wiki"],
	};
}
