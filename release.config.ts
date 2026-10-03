import { defineConfig } from "@theholocron/semantic-release-config";

const config = defineConfig({
	branches: ["main", { name: "alpha", prerelease: true }],
	exec: {
		prepareCmd: "node packages/cli/dist/cli.mjs bump-versions ${nextRelease.version}",
		publishCmd:
			"pnpm -r --filter='./packages/*' publish --access public --no-git-checks --provenance --tag ${nextRelease.channel || 'latest'}",
	},
});

// Deploy Sentinel once an alpha release has published (holocron#928) --
// semantic-release's `success` step only runs after every package is on npm.
// Appended here because defineConfig() has no plugin option; generalizing it
// into @theholocron/semantic-release-config is holocron#930.
// Defaults: the alpha channel, and paths derived from Sentinel's own
// package.json (itself plus its workspace:* dependencies, the packages
// inlined into its dist/). Override with { channel, paths } if needed.
(config as { plugins: unknown[] }).plugins.push("./packages/sentinel/scripts/deploy-on-release.mjs");

export default config;
