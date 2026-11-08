import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createAstromech, readWorkspacePackages } from "@theholocron/astromech";
import type { TasksConfig } from "@theholocron/astromech/config";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginProbes } from "../../../plugin/index.js";
import { type GeneratedRepoFile, generateRepoFiles, type RepoFilesInput } from "../../repo-files/index.js";
import { checkGenerated } from "./check-generated.js";
import { checkScripts, type ScriptsOfPackage } from "./check-scripts.js";
import { generatePackageWorkflows } from "./generate-package-workflows.js";
import { sharedWorkflows } from "./shared-workflows.js";

/** The group of probes that check the files `repo setup` and `repo sync` generate. */
export const GENERATED_PROVIDER = "generated";

function readText(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

/** The `scripts` of a `package.json` that exists; none is `{}`. */
function readScripts(path: string): Record<string, string> {
	return (JSON.parse(readFileSync(path, "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};
}

/** The scripts of the root and of every workspace package, and the scripts the root should have. */
function scriptsInput(loaded: LoadedConfig, repoRoot: string) {
	const config = loaded.resolved;
	const tasksConfig: TasksConfig = { tasks: config.tasks as TasksConfig["tasks"] };
	if (config.holocronScript !== undefined) tasksConfig.holocronScript = config.holocronScript;
	const astromech = createAstromech({ cwd: repoRoot, config: tasksConfig });
	const turbo = astromech.turboConfig();
	const packages: ScriptsOfPackage[] = [];
	const rootFile = join(repoRoot, "package.json");
	if (existsSync(rootFile)) packages.push({ location: ".", scripts: readScripts(rootFile) });
	for (const pkg of readWorkspacePackages(repoRoot)) {
		const location = pkg.path ?? `${pkg.dir}/${pkg.slug}`;
		packages.push({ location, scripts: readScripts(join(repoRoot, location, "package.json")) });
	}
	return {
		packages,
		desired: config.syncScripts === false ? null : astromech.packageScripts(),
		turboKeys: new Set(turbo ? Object.keys((JSON.parse(turbo) as { tasks: object }).tasks) : []),
	};
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
 * generates. It does the same for the workflows each workspace package's own config generates (`apps/sentinel`), which
 * are named by the package in the message. CI runs it, so a change to a generator or to the config that was not followed by a run of `repo setup`
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
				const owned = await generatePackageWorkflows(repoRoot);
				const workflowsDir = join(repoRoot, ".github", "workflows");
				const workflows = new Map<string, string>();
				for (const name of readdirSync(workflowsDir)
					.filter((n) => n.endsWith(".yml"))
					.sort()) {
					workflows.set(name, readFileSync(join(workflowsDir, name), "utf8"));
				}
				const problems = [
					...first.errors,
					...owned.errors,
					...checkGenerated({
						files: first.files,
						again: second.files,
						packages: owned.packages,
						read: (path) => readText(join(repoRoot, path)),
						workflows,
					}),
				];
				const scripts = checkScripts(scriptsInput(loaded, repoRoot));
				problems.push(...scripts.fail);
				for (const line of problems) ctx.say({ status: "fail", label: line });
				for (const line of sharedWorkflows(first.files, owned.packages))
					ctx.say({ status: "info", label: line });
				for (const line of scripts.info) ctx.say({ status: "info", label: line });
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
