import { DEFAULT_ORG } from "@theholocron/astromech";

import type { Capability } from "../../config/compose/index.js";
import { DEFAULT_DOMAIN } from "../constants.js";

/**
 * Adds a documentation site deployed to Cloudflare Pages with PR previews.
 * Sets org/domain, wires Cloudflare + DNS providers and the Codecov `coverage` provider (which supplies the
 * `codecov/patch` and `codecov/project` required statuses).
 * Requires: node
 */
export function docs(): Capability {
	return {
		id: "docs",
		requires: ["node"],
		org: DEFAULT_ORG,
		domain: DEFAULT_DOMAIN,
		docs: { build: "workflow", https: true },
		providers: {
			// No `accountId`: the plugin reads CLOUDFLARE_ACCOUNT_ID through the credential chain (the environment, a
			// `credentials` provider's Environment), so the org's id is written in one place (1Password), not here (#1827).
			deployment: "cloudflare",
			dns: "cloudflare",
			workers: "cloudflare",
			// The Codecov plugin writes `codecov.yml` and says which statuses it posts (`Coverage.statusContexts()`), so
			// `codecov/patch` and `codecov/project` need no `extraRequiredChecks` entry here (#2248). The repo needs
			// `@theholocron/holocron-plugin-codecov` in its `holocron` catalog and `coverage` in the org's
			// `holocron_capabilities`.
			coverage: "codecov",
		},
		tasks: [{ name: "deploy-docs", with: { preview: true } }],
	};
}
