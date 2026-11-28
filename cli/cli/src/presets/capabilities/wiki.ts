import type { Capability } from "../../config/compose/index.js";
import { wikiHost } from "../constants.js";

/**
 * Adds the Fern engineering wiki (`wiki.<domain>/<repo>`, the default zone from `presets/constants`) to a repo.
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
			wiki: ["fern", { domain: wikiHost(), fernOrg: "holocron" }],
			// The Cloudflare account id comes from the credential chain (CLOUDFLARE_ACCOUNT_ID), not from a literal (#1827).
			workers: "cloudflare",
		},
		tasks: ["publish-wiki"],
	};
}
