import { commitFiles } from "../commit-files/index.js";
import { inScope } from "../in-scope/index.js";
import type { CommitStep, ReleaseContext, StepPlugin } from "../release.type.js";
import type { FolderScopedDeps } from "./folder-scoped.type.js";

/** The semantic-release plugin that implements each commit-reading step. */
const MODULES: Record<CommitStep, string> = {
	analyzeCommits: "@semantic-release/commit-analyzer",
	generateNotes: "@semantic-release/release-notes-generator",
};

/**
 * An inline semantic-release plugin that runs `step` of the stock plugin
 * (`@semantic-release/commit-analyzer` for `analyzeCommits`,
 * `@semantic-release/release-notes-generator` for `generateNotes`) over only
 * the commits that changed a file at or under `paths`.
 *
 * After a monorepo import, `lastTag..HEAD` spans every folder's commits, so an
 * unscoped analyzer would release a folder for a commit that never touched it.
 * The wrapped plugin is loaded on first use, so it only needs to be installed
 * where a release actually runs. Commits are listed with one `git diff-tree`
 * call, in `context.cwd`.
 */
export function folderScoped<Step extends CommitStep>(
	step: Step,
	paths: readonly string[],
	{ load = (specifier) => import(specifier), listFiles = commitFiles }: FolderScopedDeps = {}
): StepPlugin<Step> {
	const scoped = async (pluginConfig: unknown, context: ReleaseContext) => {
		const inner = (await load(MODULES[step])) as StepPlugin<Step>;
		const { commits = [], cwd = process.cwd() } = context;
		const files = listFiles(
			cwd,
			commits.map((commit) => commit.hash)
		);
		const inFolder = commits.filter((commit) => inScope(files.get(commit.hash) ?? [], paths));
		return inner[step]?.(pluginConfig, { ...context, commits: inFolder });
	};
	return { [step]: scoped } as StepPlugin<Step>;
}
