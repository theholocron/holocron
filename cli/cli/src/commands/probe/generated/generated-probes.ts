import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginProbes } from "../../../plugin/index.js";
import { type GeneratedRepoFile, generateRepoFiles, type RepoFilesInput } from "../../repo-files/index.js";
import { checkGenerated } from "./check-generated.js";

/** The group of probes that check the files `repo setup` and `repo sync` generate. */
export const GENERATED_PROVIDER = "generated";

function readText(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

async function generate(input: RepoFilesInput) {
	const entries = await generateRepoFiles(input);
	return {
		files: entries.filter((e): e is GeneratedRepoFile => e.kind === "file"),
		errors: entries.flatMap((e) => (e.kind === "error" ? [`${e.step}: ${e.message}`] : [])),
	};
}

/**
 * `generated check` generates every file `repo setup` writes from the config alone (no provider, no token), twice, and
 * fails for each one that differs from the committed copy, differs the second time, or is a workflow nothing
 * generates. CI runs it, so a change to a generator or to the config that was not followed by a run of `repo setup`
 * or `repo sync` cannot merge.
 */
export function generatedProbes(loaded: LoadedConfig, repoRoot: string): PluginProbes {
	return {
		check: {
			summary: "Fail for each generated file that differs from the committed copy (CI runs this).",
			writes: false,
			async run(ctx) {
				const input: RepoFilesInput = { loaded, repoRoot };
				const first = await generate(input);
				const second = await generate(input);
				const workflowsDir = join(repoRoot, ".github", "workflows");
				const workflows = new Map<string, string>();
				for (const name of readdirSync(workflowsDir)
					.filter((n) => n.endsWith(".yml"))
					.sort()) {
					workflows.set(name, readFileSync(join(workflowsDir, name), "utf8"));
				}
				const problems = [
					...first.errors,
					...checkGenerated({
						files: first.files,
						again: second.files,
						read: (path) => readText(join(repoRoot, path)),
						workflows,
					}),
				];
				for (const line of problems) ctx.say({ status: "fail", label: line });
				if (problems.length === 0) {
					ctx.say({
						status: "ok",
						label: `${first.files.length} files`,
						detail: "all match what holocron generates",
					});
				}
			},
		},
	};
}
