import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
	createAlexignore,
	createAlexrc,
	createAstromech,
	createCommitMsg,
	createDependabot,
	createDevmoji,
	createEditorconfig,
	createEditorconfigChecker,
	createHeader,
	createLabeler,
	createPreCommit,
	createPrepareCommitMsg,
	createPrePush,
	createYamlignore,
	createYamllint,
	readWorkspacePackages,
} from "@theholocron/astromech";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import dcoConfig from "../../templates/dco.yml";
import { ownCatalogPackages } from "../setup/own-catalog-packages/index.js";
import { hooksEnabled } from "./hooks-enabled.js";
import type { GeneratedRepoFile, RepoFileEntry, RepoFilesInput } from "./repo-files.type.js";

const { workflowHeader } = createHeader({
	source: "cli/cli/src/commands/repo-files/generate-config-files.ts",
	tool: "holocron repo setup",
});

function file(path: string, content: string, note?: string): GeneratedRepoFile {
	const step = `write ${path}`;
	return { kind: "file", path, content, step, syncStep: step, ...(note === undefined ? {} : { note }) };
}

/**
 * The config files that are not workflows: the labeler, Dependabot and DCO configs, the lint and editor configs, the
 * git hooks and `codecov.yml`, in the order `repo setup` writes them. `codecov.yml` is merged into the copy already on
 * disk, so the file is read here.
 */
export async function generateConfigFiles(input: RepoFilesInput): Promise<RepoFileEntry[]> {
	const config = input.loaded.resolved;
	const taskNames = (config.tasks ?? []).map((e) => (typeof e === "string" ? e : e.name));
	const entries: RepoFileEntry[] = [];

	if (taskNames.includes("bookkeeping")) entries.push(file(".github/labeler.yml", createLabeler()));

	if (config.repo?.protection !== "none") {
		entries.push(
			file(".github/dependabot.yml", createDependabot({ ignore: ownCatalogPackages(input.repoRoot) })),
			file(".github/dco.yml", `${workflowHeader()}${dcoConfig}`)
		);
	}

	entries.push(
		file(".alexrc.json", createAlexrc()),
		file(".alexignore", createAlexignore()),
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

	const existing = await readFile(join(input.repoRoot, "codecov.yml"), "utf8").catch(() => null);
	if (!taskNames.includes("verification.unitTests") && existing == null) {
		entries.push({
			kind: "skip",
			step: "write codecov.yml",
			syncStep: "write codecov.yml",
			message: "no test workflow configured",
		});
	} else {
		try {
			const content = createAstromech({ cwd: input.repoRoot, logger: input.logger ?? getLogger() }).codecovConfig(
				existing
			);
			const packageCount = readWorkspacePackages(input.repoRoot).length;
			entries.push(
				file("codecov.yml", content, packageCount > 0 ? `${packageCount} components` : "no components")
			);
		} catch (error) {
			entries.push({
				kind: "error",
				step: "write codecov.yml",
				syncStep: "write codecov.yml",
				message: errorMessage(error),
			});
		}
	}
	return entries;
}
