interface ExecOptions {
	prepareCmd?: string;
	publishCmd?: string;
}
interface NpmOptions {
	access?: "public" | "restricted";
	pkgRoot?: string;
	tarballDir?: string;
}
interface Options {
	branches?: Array<string | Record<string, unknown>>;
	exec?: ExecOptions;
	npm?: boolean | NpmOptions;
	assets?: string[];
}

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
const defaultSingleAssets = ["CHANGELOG.md", "package.json"];
const defaultMessage =
	"chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}\n\nSigned-off-by: Newton <5769156+iamnewton@users.noreply.github.com>";

/**
 * @see https://semantic-release.gitbook.io/semantic-release/usage/configuration
 */
export function defineConfig({
	branches = ["main"],
	exec,
	npm,
	assets,
}: Options = {}): object {
	const npmOptions: NpmOptions =
		npm === true ? { access: "public" } : npm || {};
	const resolvedAssets =
		assets ?? (npm ? defaultSingleAssets : defaultAssets);

	return {
		branches,
		plugins: [
			commitAnalyzer,
			releaseNotesGenerator,
			"@semantic-release/changelog",
			...(npm ? [["@semantic-release/npm", npmOptions]] : []),
			...(exec ? [["@semantic-release/exec", exec]] : []),
			[
				"@semantic-release/git",
				{ assets: resolvedAssets, message: defaultMessage },
			],
			"@semantic-release/github",
		],
	};
}
