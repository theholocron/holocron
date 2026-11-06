import type { Capability } from "../../config/compose/index.js";

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
			// No `accountId`: the plugin reads CLOUDFLARE_ACCOUNT_ID through the credential chain (the environment, a
			// `credentials` provider's Environment), so the org's id is written in one place (1Password), not here (#1827).
			deployment: "cloudflare",
			dns: "cloudflare",
			workers: "cloudflare",
		},
		tasks: [{ name: "deploy-docs", with: { preview: true } }],
		// Not task-backed — codecov gates. `holocron setup` appends these to the
		// `{ required: true }` task contexts.
		extraRequiredChecks: ["codecov/patch", "codecov/project"],
	};
}
