import { defineConfig } from "@theholocron/semantic-release-config";

export default defineConfig({
	branches: ["main", { name: "alpha", prerelease: true }],
	exec: {
		prepareCmd: "node cli/cli/dist/cli.mjs package bump-versions ${nextRelease.version}",
		publishCmd:
			"node cli/cli/dist/cli.mjs package publish --skip-already-published --tag ${nextRelease.channel || 'latest'}",
	},
});
