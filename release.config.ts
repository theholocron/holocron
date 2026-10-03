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
(config as { plugins: unknown[] }).plugins.push([
	"./packages/sentinel/scripts/deploy-on-release.mjs",
	{
		channel: "alpha",
		// Sentinel, plus the workspace packages inlined into its dist/ (holocron#922).
		paths: ["packages/sentinel/", "packages/cli/", "packages/astromech/", "packages/datapad/"],
	},
]);

export default config;
