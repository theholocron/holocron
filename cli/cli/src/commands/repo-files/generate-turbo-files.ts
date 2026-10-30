import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createAstromech } from "@theholocron/astromech";
import type { TasksConfig } from "@theholocron/astromech/config";

import { getLogger } from "../../observability/logger/index.js";
import type { GeneratedRepoFile, RepoFilesInput, SkippedRepoFile } from "./repo-files.type.js";

/**
 * `turbo.json`, and the two edits that go with it: `turbo.json` alone is inert unless the root is a workspace member
 * (#692) and turbo is a dependency, so `pnpm-workspace.yaml` and the root `package.json` are fixed in the same step that
 * introduces the risk. An edit is an entry only when it changes the file.
 */
export async function generateTurboFiles(input: RepoFilesInput): Promise<(GeneratedRepoFile | SkippedRepoFile)[]> {
	const astromech = createAstromech({
		cwd: input.repoRoot,
		config: { tasks: input.loaded.resolved.tasks as TasksConfig["tasks"] },
		logger: input.logger ?? getLogger(),
	});
	const content = astromech.turboConfig();
	if (content === null) {
		return [
			{
				kind: "skip",
				step: "write turbo.json",
				syncStep: "sync turbo.json",
				message: "no fan-out-eligible tasks configured",
			},
		];
	}

	const entries: (GeneratedRepoFile | SkippedRepoFile)[] = [
		{ kind: "file", path: "turbo.json", content, step: "write turbo.json", syncStep: "sync turbo.json" },
	];
	const rootPkgRaw = await readFile(join(input.repoRoot, "package.json"), "utf8").catch(() => null);
	const rootPkg = rootPkgRaw ? (JSON.parse(rootPkgRaw) as { scripts?: Record<string, string> }) : null;
	const workspaceYaml = await readFile(join(input.repoRoot, "pnpm-workspace.yaml"), "utf8").catch(() => "");
	const workspaceFix = astromech.ensureRootWorkspaceMember(workspaceYaml, rootPkg?.scripts ?? {});
	if (workspaceFix.changed) {
		const step = "fix pnpm-workspace.yaml (root workspace member, #692)";
		entries.push({
			kind: "file",
			path: "pnpm-workspace.yaml",
			content: workspaceFix.content,
			step,
			syncStep: step,
		});
	}
	if (rootPkgRaw) {
		const depFix = astromech.ensureTurboDependency(rootPkgRaw, workspaceFix.content);
		if (depFix.changed) {
			entries.push({
				kind: "file",
				path: "package.json",
				content: depFix.content,
				step: "add turbo devDependency",
				syncStep: "add turbo devDependency",
			});
		}
	}
	return entries;
}
