/**
 * Checkly monitoring-as-code config for Sentinel — deliberately not a
 * holocron capability/plugin. Checkly already ships its own idiomatic
 * CI path (`npx checkly deploy`, triggered from `.github/workflows/
 * checkly.yml`), and there's no multi-repo provisioning need the
 * capability/provider model exists to solve — this is one check,
 * watching one deployed endpoint. Revisit as a plugin only if a second
 * repo needs its own Checkly project provisioned the way `holocron repo
 * setup` provisions a Vercel/Sentry project today.
 *
 * See https://www.checklyhq.com/docs/cli/project-structure/.
 */

import { defineConfig } from "checkly";

export default defineConfig({
	projectName: "Sentinel",
	logicalId: "sentinel",
	repoUrl: "https://github.com/theholocron/holocron",
	checks: {
		frequency: 5,
		locations: ["us-east-1", "eu-west-1"],
		tags: ["sentinel"],
		checkMatch: "__checks__/**/*.check.ts",
	},
	cli: {
		runLocation: "us-east-1",
		reporters: ["list"],
	},
});
