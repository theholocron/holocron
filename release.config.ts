import { hostedReusableWorkflows } from "@theholocron/astromech";
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

// Groups that publish nothing to npm: a release bumps the group's private package, records the release, tags it
// (`ci-v1.4.0`) and moves the major tag (`ci-v1`) that callers pin. They release from `main` only, so an alpha
// never moves a tag that outside callers follow.
const tagOnly = new Set(["ci"]);

// What counts as a change to `ci`: its folder, and the reusables generated from it into `.github/workflows` (a commit
// that changes only those still changes what callers get). Not the repo's own `ci.<name>.yml` callers or its
// hand-written workflows, which are not the group's.
const ciPaths = ["ci", ...[...hostedReusableWorkflows().keys()].map((name) => `.github/workflows/${name}.yml`)];

export default group && tagOnly.has(group)
	? groupReleaseConfig({
			group,
			paths: ciPaths,
			branches: ["main"],
			exec: {
				prepareCmd: `${holocron} package bump-versions \${nextRelease.version} --group ${group} --include-private`,
				publishCmd: `${holocron} package move-tag ${group} \${nextRelease.version}`,
			},
		})
	: group
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
