import type { Capability } from "../../config/compose/index.js";
import { CLOUDFLARE_ACCOUNT_ID } from "../constants.js";

/**
 * Adds a documentation site deployed to Cloudflare Pages with PR previews.
 * Sets org/domain, wires Cloudflare + DNS providers, and adds the codecov
 * `extraRequiredChecks` (enabled for all docs repos).
 * Requires: node
 */
export function docs(): Capability {
	return {
		id: "docs",
		requires: ["node"],
		org: "theholocron",
		domain: "theholocron.dev",
		docs: { build: "workflow", https: true },
		providers: {
			deployment: ["cloudflare", { accountId: CLOUDFLARE_ACCOUNT_ID }],
			dns: "cloudflare",
			workers: ["cloudflare", { accountId: CLOUDFLARE_ACCOUNT_ID }],
		},
		tasks: [{ name: "deploy", with: { docs: true, preview: true } }],
		// Not task-backed — codecov gates. `holocron setup` appends these to the
		// `{ required: true }` task contexts.
		extraRequiredChecks: ["codecov/patch", "codecov/project"],
	};
}
