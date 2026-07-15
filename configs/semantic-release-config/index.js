const releaseRules = [
	{ type: "feat", release: "minor" },
	{ type: "fix", release: "patch" },
	{ type: "perf", release: "patch" },
	{ type: "refactor", release: "patch" },
	{ type: "chore", scope: "deps", release: "patch" },
	{ breaking: true, release: "major" },
];

const types = [
	{ type: "feat", section: "Features" },
	{ type: "fix", section: "Bug Fixes" },
	{ type: "perf", section: "Performance" },
	{ type: "refactor", section: "Refactoring" },
	{ type: "docs", section: "Documentation", hidden: false },
	{ type: "chore", section: "Chores", hidden: false },
	{ type: "ci", section: "CI", hidden: true },
	{ type: "test", section: "Tests", hidden: true },
];

export const commitAnalyzer = [
	"@semantic-release/commit-analyzer",
	{ preset: "conventionalcommits", releaseRules },
];

export const releaseNotesGenerator = [
	"@semantic-release/release-notes-generator",
	{ preset: "conventionalcommits", presetConfig: { types } },
];

const defaultAssets = [
	"CHANGELOG.md",
	"package.json",
	"packages/*/package.json",
];
const defaultMessage =
	"chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}\n\nSigned-off-by: Newton <5769156+iamnewton@users.noreply.github.com>";

/**
 * @see https://semantic-release.gitbook.io/semantic-release/usage/configuration
 * @param {{ branches?: Array<string|object>, exec?: { prepareCmd?: string, publishCmd?: string }, assets?: string[] }} [options]
 */
export function defineConfig({
	branches = ["main"],
	exec,
	assets = defaultAssets,
} = {}) {
	return {
		branches,
		plugins: [
			commitAnalyzer,
			releaseNotesGenerator,
			"@semantic-release/changelog",
			...(exec ? [["@semantic-release/exec", exec]] : []),
			["@semantic-release/git", { assets, message: defaultMessage }],
			"@semantic-release/github",
		],
	};
}
