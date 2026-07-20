import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Source } from "../capabilities/index.js";
import type { LoadedConfig } from "../load-config.js";
import { PluginLoader, type RuntimeContext } from "../loader.js";
import { CANONICAL_LABELS, STALE_LABELS } from "./setup.js";
import type { SetupPrintLine, SetupReport, SetupStepResult } from "./setup.js";

export const SYNC_STEPS = ["labels", "properties", "topics", "keywords", "description"] as const;
export type SyncStep = (typeof SYNC_STEPS)[number];

export interface RunSyncInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	steps?: string[];
	loader?: PluginLoader;
	print?: SetupPrintLine;
}

export async function runSync(input: RunSyncInput): Promise<SetupReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();

	const config = input.loaded.resolved;
	const dryRun = input.context.dryRun ?? false;
	const requestedSteps = input.steps;
	const steps: SetupStepResult[] = [];

	print(`Holocron sync — ${config.name}${dryRun ? " (dry-run)" : ""}`);
	print(`  config: ${input.loaded.filepath}`);
	print("");

	if (loader.has("source")) {
		const source = loader.get("source") as Source;
		print("  → source");

		for (const stepName of SYNC_STEPS) {
			if (requestedSteps !== undefined && !requestedSteps.includes(stepName)) {
				continue;
			}

			if (stepName === "labels") {
				if (source.syncLabels) {
					steps.push(
						await runSyncStep("source", "sync labels", dryRun, () =>
							source.syncLabels!(CANONICAL_LABELS, STALE_LABELS)
						)
					);
					print(formatSyncStep(steps[steps.length - 1]!));
				} else {
					steps.push({
						capability: "source",
						step: "sync labels",
						status: "skip",
						message: "provider does not implement syncLabels",
					});
					print(formatSyncStep(steps[steps.length - 1]!));
				}
			}

			if (stepName === "properties") {
				if (source.syncProperties) {
					const repo = config.repo;
					const properties: Record<string, string> = {};
					const effectivePreset = repo?.protection;
					if (effectivePreset && effectivePreset !== "none")
						properties["branch_protection_level"] = effectivePreset;
					const isMonorepo = await access(join(input.context.repoRoot, "pnpm-workspace.yaml"))
						.then(() => true)
						.catch(() => false);
					properties["monorepo"] = String(isMonorepo);
					const manual = repo?.properties ?? {};
					if (manual.lifecycle) properties["lifecycle"] = manual.lifecycle;
					if (manual.open_source !== undefined) properties["open_source"] = String(manual.open_source);
					if (manual.runtime_environment) properties["runtime_environment"] = manual.runtime_environment;
					if (manual.uses_external_packages !== undefined)
						properties["uses_external_packages"] = String(manual.uses_external_packages);

					steps.push(
						await runSyncStep("source", "sync properties", dryRun, () => source.syncProperties!(properties))
					);
					print(formatSyncStep(steps[steps.length - 1]!));
				} else {
					steps.push({
						capability: "source",
						step: "sync properties",
						status: "skip",
						message: "provider does not implement syncProperties",
					});
					print(formatSyncStep(steps[steps.length - 1]!));
				}
			}

			if (stepName === "topics") {
				const topics = config.repo?.topics ?? [];
				if (topics.length === 0) {
					steps.push({
						capability: "source",
						step: "sync topics",
						status: "skip",
						message: "no topics configured",
					});
					print(formatSyncStep(steps[steps.length - 1]!));
				} else if (source.syncTopics) {
					steps.push(await runSyncStep("source", "sync topics", dryRun, () => source.syncTopics!(topics)));
					print(formatSyncStep(steps[steps.length - 1]!));
				} else {
					steps.push({
						capability: "source",
						step: "sync topics",
						status: "skip",
						message: "provider does not implement syncTopics",
					});
					print(formatSyncStep(steps[steps.length - 1]!));
				}
			}

			if (stepName === "keywords") {
				const topics = config.repo?.topics ?? [];
				if (topics.length === 0) {
					steps.push({
						capability: "source",
						step: "sync keywords",
						status: "skip",
						message: "no topics configured",
					});
					print(formatSyncStep(steps[steps.length - 1]!));
				} else {
					steps.push(
						await runSyncStep("source", "sync keywords", dryRun, async () => {
							const wrote = await writePackageJsonField(input.context.repoRoot, "keywords", topics);
							return wrote
								? `${topics.length} keywords written`
								: `${topics.length} topics (no package.json)`;
						})
					);
					print(formatSyncStep(steps[steps.length - 1]!));
				}
			}

			if (stepName === "description") {
				const description = config.description;
				if (!description) {
					steps.push({
						capability: "source",
						step: "sync description",
						status: "skip",
						message: "no description configured",
					});
					print(formatSyncStep(steps[steps.length - 1]!));
				} else {
					steps.push(
						await runSyncStep("source", "sync description", dryRun, async () => {
							const pkgWrote = await writePackageJsonField(
								input.context.repoRoot,
								"description",
								description
							);
							const readmeWrote = await updateReadmeDescription(input.context.repoRoot, description);
							if (source.syncDescription) {
								await source.syncDescription(description);
							}
							const parts: string[] = [];
							if (pkgWrote) parts.push("package.json");
							if (readmeWrote) parts.push("README.md");
							if (source.syncDescription) parts.push("GitHub");
							return parts.length > 0 ? parts.join(", ") + " updated" : "description synced";
						})
					);
					print(formatSyncStep(steps[steps.length - 1]!));
				}
			}
		}

		// Report unknown step names
		if (requestedSteps) {
			for (const name of requestedSteps) {
				if (!(SYNC_STEPS as ReadonlyArray<string>).includes(name)) {
					steps.push({
						capability: "source",
						step: `sync ${name}`,
						status: "skip",
						message: `unknown step "${name}"`,
					});
					print(formatSyncStep(steps[steps.length - 1]!));
				}
			}
		}
	}

	const summary = steps.reduce(
		(acc, s) => {
			if (s.status === "ok") acc.ok += 1;
			else if (s.status === "fail") acc.fail += 1;
			else if (s.status === "skip") acc.skip += 1;
			else if (s.status === "dry-run") acc.dryRun += 1;
			return acc;
		},
		{ ok: 0, fail: 0, skip: 0, dryRun: 0 }
	);

	print("");
	print(
		`  ${summary.ok} ok, ${summary.fail} fail, ${summary.skip} skipped${
			dryRun ? `, ${summary.dryRun} would-do` : ""
		}`
	);

	return { steps, summary };
}

async function runSyncStep(
	capability: string,
	step: string,
	dryRun: boolean,
	body: () => Promise<string | void>
): Promise<SetupStepResult> {
	if (dryRun) {
		return { capability, step, status: "dry-run" };
	}
	try {
		const note = await body();
		const result: SetupStepResult = { capability, step, status: "ok" };
		if (typeof note === "string") result.message = note;
		return result;
	} catch (err) {
		return {
			capability,
			step,
			status: "fail",
			message: err instanceof Error ? err.message : String(err),
		};
	}
}

function formatSyncStep(step: SetupStepResult): string {
	const icon = step.status === "ok" ? "✓" : step.status === "fail" ? "✗" : step.status === "dry-run" ? "…" : "·";
	const detail = step.message ? `  (${step.message})` : "";
	return `    ${icon} ${step.step}${detail}`;
}

async function writePackageJsonField(repoRoot: string, field: string, value: unknown): Promise<boolean> {
	const pkgPath = join(repoRoot, "package.json");
	let content: string;
	try {
		content = await readFile(pkgPath, "utf8");
	} catch {
		return false;
	}
	const pkg = JSON.parse(content) as Record<string, unknown>;
	pkg[field] = value;
	await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
	return true;
}

async function updateReadmeDescription(repoRoot: string, description: string): Promise<boolean> {
	const readmePath = join(repoRoot, "README.md");
	let content: string;
	try {
		content = await readFile(readmePath, "utf8");
	} catch {
		return false;
	}
	const lines = content.split("\n");
	const h1Index = lines.findIndex((l) => /^# /.test(l));
	if (h1Index === -1) return false;

	let i = h1Index + 1;
	while (i < lines.length && lines[i]!.trim() === "") i++;

	if (i >= lines.length || lines[i]!.startsWith("#")) {
		lines.splice(h1Index + 1, 0, "", description);
	} else {
		const descStart = i;
		let descEnd = i;
		while (descEnd < lines.length && lines[descEnd]!.trim() !== "" && !lines[descEnd]!.startsWith("#")) {
			descEnd++;
		}
		lines.splice(descStart, descEnd - descStart, description);
	}
	await writeFile(readmePath, lines.join("\n"), "utf8");
	return true;
}
