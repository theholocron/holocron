import { defineConfig } from "@theholocron/semantic-release-config";

const config = defineConfig({
	branches: ["main", { name: "alpha", prerelease: true }],
	exec: {
		prepareCmd: "node packages/cli/dist/cli.mjs bump-versions ${nextRelease.version}",
		publishCmd:
			"pnpm -r --filter='./packages/*' publish --access public --no-git-checks --provenance --tag ${nextRelease.channel || 'latest'}",
	},
});

// Deploy every workspace package whose task manifest asks for it once a
// release has published (holocron#928, #930): the plugin scans packages/* for
// a `delivery.deploy` task with `with: { on: "release" }` (Sentinel's
// holocron.config.ts), so nothing here names an app. Appended because
// defineConfig() has no plugin option; moving it into
// @theholocron/semantic-release-config would need that repo.
(config as { plugins: unknown[] }).plugins.push("./packages/astromech/dist/release.mjs");

export default config;
