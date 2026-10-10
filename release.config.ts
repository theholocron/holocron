import { defineConfig } from "@theholocron/semantic-release-config";

export default defineConfig({
	branches: ["main", { name: "alpha", prerelease: true }],
	exec: {
		prepareCmd: "node packages/cli/dist/cli.mjs package bump-versions ${nextRelease.version}",
		publishCmd:
			"node packages/cli/dist/cli.mjs publish --skip-already-published --tag ${nextRelease.channel || 'latest'}",
	},
});
