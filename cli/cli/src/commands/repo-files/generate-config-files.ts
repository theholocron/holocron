import { existsSync } from "node:fs";
import { join } from "node:path";

import {
	createCommitMsg,
	createDco,
	createDependabot,
	createDevmoji,
	createEditorconfig,
	createEditorconfigChecker,
	createLabeler,
	createPreCommit,
	createPrepareCommitMsg,
	createPrePush,
	createYamlignore,
	createYamllint,
	isTask,
} from "@theholocron/astromech";
import { errorMessage } from "@theholocron/misc-utils";

import { ownCatalogPackages } from "../setup/own-catalog-packages/index.js";
import { hooksEnabled } from "./hooks-enabled.js";
import { hostsReusables } from "./hosted-reusables.js";
import type { GeneratedRepoFile, RepoFileEntry, RepoFilesInput } from "./repo-files.type.js";

/** Where a repo that hosts the reusables keeps the sources of its generated workflows and the actions they run. */
const HOSTED_SOURCES = ["/ci/workflows", "/ci/workflows/*", "/ci/actions/*"] as const;

function file(path: string, content: string, note?: string): GeneratedRepoFile {
	const step = `write ${path}`;
	return { kind: "file", path, content, step, syncStep: step, ...(note === undefined ? {} : { note }) };
}

/** The step `setup` and `sync` report when the coverage provider's files are not written, whichever file that is. */
const COVERAGE_STEP = "write coverage config";

/**
 * The files the `coverage` provider writes (`codecov.yml`), from `input.coverageConfigFiles`. Without one (no provider
 * is loaded, or it writes none) the step is skipped and no file is written or changed. A file that is not there yet is
 * only written when a `test:unit` task is configured: a repo with no test workflow has nothing to report coverage for.
 * A provider that throws is a failed step.
 */
function coverageConfigEntries(input: RepoFilesInput, taskNames: string[]): RepoFileEntry[] {
	const skip = (step: string, message: string): RepoFileEntry => ({ kind: "skip", step, syncStep: step, message });
	if (input.coverageConfigFiles === undefined) return [skip(COVERAGE_STEP, "no coverage provider configured")];
	let files: Record<string, string>;
	try {
		files = input.coverageConfigFiles();
	} catch (error) {
		return [{ kind: "error", step: COVERAGE_STEP, syncStep: COVERAGE_STEP, message: errorMessage(error) }];
	}
	const hasTests = taskNames.some((name) => isTask(name, "test:unit"));
	return Object.entries(files).map(([path, content]) =>
		!hasTests && !existsSync(join(input.repoRoot, path))
			? skip(`write ${path}`, "no test workflow configured")
			: file(path, content)
	);
}

/**
 * The config files that are not workflows: the labeler, Dependabot and DCO configs, the lint and editor configs, the
 * git hooks and the coverage provider's config (`codecov.yml`), in the order `setup` writes them.
 */
export function generateConfigFiles(input: RepoFilesInput): RepoFileEntry[] {
	const config = input.loaded.resolved;
	const taskNames = (config.tasks ?? []).map((e) => (typeof e === "string" ? e : e.name));
	const entries: RepoFileEntry[] = [];

	if (taskNames.includes("bookkeeping")) entries.push(file(".github/labeler.yml", createLabeler()));

	if (config.repo?.protection !== "none") {
		entries.push(
			file(
				".github/dependabot.yml",
				createDependabot({
					ignore: ownCatalogPackages(input.repoRoot),
					sources: hostsReusables(input.repoRoot) ? HOSTED_SOURCES : [],
				})
			),
			file(".github/dco.yml", createDco())
		);
	}

	entries.push(
		file(".yamllint.yml", createYamllint()),
		file(".yamlignore", createYamlignore()),
		file(".editorconfig", createEditorconfig()),
		file(".editorconfig-checker.json", createEditorconfigChecker()),
		file("devmoji.config.cjs", createDevmoji()),
		file(".husky/prepare-commit-msg", createPrepareCommitMsg()),
		file(".husky/commit-msg", createCommitMsg(config.holocronScript))
	);

	if (hooksEnabled(input)) {
		entries.push(
			file(
				".husky/pre-push",
				createPrePush(config.holocronScript),
				"runs `holocron run ci` before push — bypass with `git push --no-verify`"
			),
			file(".husky/pre-commit", createPreCommit(), "runs GitLeaks (staged-only) + lint-staged before commit")
		);
	} else {
		for (const hook of [".husky/pre-push", ".husky/pre-commit"]) {
			entries.push({
				kind: "skip",
				step: `write ${hook}`,
				syncStep: `write ${hook}`,
				message: "git hooks disabled",
			});
		}
	}

	entries.push(...coverageConfigEntries(input, taskNames));
	return entries;
}
