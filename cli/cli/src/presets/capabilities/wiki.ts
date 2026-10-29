import type { Capability } from "../../config/compose/index.js";

/**
 * Adds the Fern engineering wiki (wiki.theholocron.dev/<repo>) to a repo.
 * Provisions docs/wiki/{decisions,standards,specifications}/ and wires the
 * wiki CI workflow to publish on push to main.
 *
 * Compose with nodeDocs() for repos that have engineering content to publish:
 *
 * ```ts
 * const preset = compose(nodeDocs(), wiki());
 * ```
 */
export function wiki(): Capability {
	return {
		id: "wiki",
		providers: {
			wiki: ["fern", { domain: "wiki.theholocron.dev", fernOrg: "holocron" }],
			workers: ["cloudflare", { accountId: "9c558af98664d13fc89b7e0a0d93d5a8" }],
		},
		tasks: ["wiki"],
	};
}
