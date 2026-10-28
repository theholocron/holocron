import { loadTasksConfig } from "@theholocron/astromech/config";
import { groupReleaseConfig, releaseGroups, ungroupedReleaseConfig } from "@theholocron/astromech/release";

const branches = ["main", { name: "alpha", prerelease: true }];
const holocron = "node cli/cli/dist/cli.mjs";
const tag = "${nextRelease.channel || 'latest'}";

// The folders that release on their own line (listed under `groups` in the `delivery.publish`
// task, which also drives the generated workflow). The workflow runs one release per group with
// RELEASE_GROUP set, plus the repo-wide release for everything else without it.
const groups = releaseGroups(await loadTasksConfig(process.cwd()));
const group = process.env["RELEASE_GROUP"];

// The repo-wide release leaves the groups out, so it does not move or publish them.
const exclude = groups.map((name) => ` --exclude-group ${name}`).join("");

export default group
	? groupReleaseConfig({
			group,
			branches,
			exec: {
				prepareCmd: `${holocron} package bump-versions \${nextRelease.version} --group ${group}`,
				publishCmd: `${holocron} package publish --group ${group} --skip-already-published --tag ${tag}`,
			},
		})
	: ungroupedReleaseConfig({
			groups,
			branches,
			// semantic-release-config's default still names `packages/*/package.json`
			assets: ["CHANGELOG.md", "package.json", "cli/*/package.json"],
			exec: {
				prepareCmd: `${holocron} package bump-versions \${nextRelease.version}${exclude}`,
				publishCmd: `${holocron} package publish --skip-already-published${exclude} --tag ${tag}`,
			},
		});
