import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createAstromech, KNOWN_WORKFLOWS } from "@theholocron/astromech";
import type { TasksConfig } from "@theholocron/astromech/config";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../config/load-config.js";
import { getLogger } from "../logger.js";
import type { Source } from "../plugin/capabilities.js";
import { PluginLoader, type RuntimeContext } from "../plugin/loader.js";
import { createHeader } from "../utils/create-header.js";
import type { SetupPrintLine, SetupReport, SetupStepResult } from "./setup/index.js";
import { CANONICAL_LABELS, STALE_LABELS } from "./setup/index.js";

const { workflowHeader } = createHeader({
	source: "packages/cli/src/commands/sync.ts",
	tool: "holocron sync",
});
import { runSyncReadme } from "./sync-readme.js";
import { runSyncWiki } from "./sync-wiki.js";

export const SYNC_STEPS = [
	"labels",
	"properties",
	"teams",
	"topics",
	"keywords",
	"description",
	"homepage",
	"readme",
	"workflows",
	"scripts",
	"wiki",
] as const;
export type SyncStep = (typeof SYNC_STEPS)[number];

// Steps that write to the local filesystem only — no provider token needed.
const LOCAL_STEPS = new Set<SyncStep>([
	"keywords",
	"description",
	"homepage",
	"readme",
	"workflows",
	"scripts",
	"wiki",
]);

export interface RunSyncInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	steps?: string[];
	loader?: PluginLoader;
	print?: SetupPrintLine;
	/** Structured-logging sink — sibling of `print`. Defaults to the command-bound root. */
	logger?: Logger;
}

export async function runSync(input: RunSyncInput): Promise<SetupReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);

	const config = input.loaded.resolved;
	const dryRun = input.context.dryRun ?? false;
	const requestedSteps = input.steps;
	const steps: SetupStepResult[] = [];

	logger.info({ config: config.name, steps: requestedSteps ?? "all", dryRun: dryRun || undefined }, "sync: start");

	// `load()` soft-skips any plugin it can't load (missing token, package
	// not installed). Remote steps then push a `skip` result when
	// `source` is absent; local steps (keywords, description, readme…)
	// write to disk regardless.
	await loader.load();
	for (const failure of loader.loadFailures()) {
		logger.warn(
			{ capability: failure.key, provider: failure.provider, reason: failure.error.message },
			`sync: plugin ${failure.provider} unavailable`
		);
	}

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
			// Local steps are handled below, outside this block.
			if (LOCAL_STEPS.has(stepName)) continue;

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

			if (stepName === "teams") {
				const teams = config.repo?.teams ?? [];
				if (teams.length === 0) {
					steps.push({
						capability: "source",
						step: "sync teams",
						status: "skip",
						message: "no teams configured",
					});
					print(formatSyncStep(steps[steps.length - 1]!));
				} else if (source.syncTeams) {
					steps.push(await runSyncStep("source", "sync teams", dryRun, () => source.syncTeams!(teams)));
					print(formatSyncStep(steps[steps.length - 1]!));

					const repoCoord = input.context.repo ?? config.repo?.name ?? "";
					const org = repoCoord.includes("/") ? repoCoord.split("/")[0]! : "";
					const writeableTeams = teams
						.map((t) => (typeof t === "string" ? { slug: t, permission: "push" as const } : t))
						.filter((t) => ["push", "maintain", "admin"].includes(t.permission));
					if (org && writeableTeams.length > 0) {
						steps.push(
							await runSyncStep("source", "write .github/CODEOWNERS", dryRun, async () => {
								const content = writeableTeams.map((t) => `* @${org}/${t.slug}`).join("\n") + "\n";
								await source.writeRepoFile(".github/CODEOWNERS", content);
							})
						);
						print(formatSyncStep(steps[steps.length - 1]!));
					}
				} else {
					steps.push({
						capability: "source",
						step: "sync teams",
						status: "skip",
						message: "provider does not implement syncTeams",
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

	// ── local-only steps (no provider token required) ──────────────────
	// keywords, description, homepage, readme, and workflows write to local
	// files and optionally push to GitHub when source is loaded. They run
	// outside the `if (loader.has("source"))` block so they work without a token.

	for (const stepName of ["keywords", "description", "homepage", "readme", "workflows", "scripts", "wiki"] as const) {
		if (requestedSteps !== undefined && !requestedSteps.includes(stepName)) {
			continue;
		}

		if (stepName === "keywords") {
			const topics = config.repo?.topics ?? [];
			if (topics.length === 0) {
				steps.push({
					capability: "local",
					step: "sync keywords",
					status: "skip",
					message: "no topics configured",
				});
				print(formatSyncStep(steps[steps.length - 1]!));
			} else {
				steps.push(
					await runSyncStep("local", "sync keywords", dryRun, async () => {
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
					capability: "local",
					step: "sync description",
					status: "skip",
					message: "no description configured",
				});
				print(formatSyncStep(steps[steps.length - 1]!));
			} else {
				const source = loader.has("source") ? (loader.get("source") as Source) : null;
				steps.push(
					await runSyncStep("local", "sync description", dryRun, async () => {
						const pkgWrote = await writePackageJsonField(
							input.context.repoRoot,
							"description",
							description
						);
						const readmeWrote = await updateReadmeDescription(input.context.repoRoot, description);
						if (source?.syncDescription) {
							await source.syncDescription(description);
						}
						const parts: string[] = [];
						if (pkgWrote) parts.push("package.json");
						if (readmeWrote) parts.push("README.md");
						if (source?.syncDescription) parts.push("GitHub");
						return parts.length > 0 ? parts.join(", ") + " updated" : "description synced";
					})
				);
				print(formatSyncStep(steps[steps.length - 1]!));
			}
		}

		if (stepName === "homepage") {
			const homepage = config.homepage;
			if (!homepage) {
				steps.push({
					capability: "local",
					step: "sync homepage",
					status: "skip",
					message: "no homepage configured",
				});
				print(formatSyncStep(steps[steps.length - 1]!));
			} else {
				const source = loader.has("source") ? (loader.get("source") as Source) : null;
				steps.push(
					await runSyncStep("local", "sync homepage", dryRun, async () => {
						const pkgWrote = await writePackageJsonField(input.context.repoRoot, "homepage", homepage);
						if (source?.syncHomepage) {
							await source.syncHomepage(homepage);
						}
						const parts: string[] = [];
						if (pkgWrote) parts.push("package.json");
						if (source?.syncHomepage) parts.push("GitHub");
						return parts.length > 0 ? parts.join(", ") + " updated" : "homepage synced";
					})
				);
				print(formatSyncStep(steps[steps.length - 1]!));
			}
		}

		if (stepName === "readme") {
			const report = await runSyncReadme({ loaded: input.loaded, context: input.context, print: () => {} });
			steps.push({
				capability: "local",
				step: "sync readme",
				status: report.status === "ok" ? "ok" : report.status === "dry-run" ? "dry-run" : "skip",
				...(report.message ? { message: report.message } : {}),
			});
			print(formatSyncStep(steps[steps.length - 1]!));
		}

		if (stepName === "workflows") {
			const taskEntries = config.tasks ?? [];
			if (taskEntries.length === 0) {
				steps.push({
					capability: "local",
					step: "sync workflows",
					status: "skip",
					message: "no tasks configured",
				});
				print(formatSyncStep(steps[steps.length - 1]!));
			} else {
				// astromech renders every thin caller from the manifest (lint linter
				// set, deploy paths, deploy+preview). Iterate the manifest (not the
				// map) so step reporting keeps the config's order.
				const files = createAstromech({
					cwd: input.context.repoRoot,
					config: { tasks: config.tasks as TasksConfig["tasks"] },
					orgContext: { org: config.org, domain: config.domain },
				}).thinCallers();

				for (const entry of taskEntries) {
					const name = typeof entry === "string" ? entry : entry.name;

					if (!KNOWN_WORKFLOWS.has(name)) {
						steps.push({
							capability: "local",
							step: `sync workflow ${name}`,
							status: "skip",
							message: `unknown workflow "${name}" — no template available`,
						});
						print(formatSyncStep(steps[steps.length - 1]!));
						continue;
					}

					const filename = name === "deploy" ? "deploy.yml" : `${name}.yml`;
					const content = files.get(filename);
					if (content === undefined) continue; // ci: false — nothing to write

					const withPreview = name === "deploy" && content.includes("workflows/preview.yml@main");
					const step = `sync workflow ${name}${withPreview ? " (with preview)" : ""}`;
					steps.push(
						await runSyncStep("local", step, dryRun, async () => {
							await writeWorkflowFile(input.context.repoRoot, filename, `${workflowHeader()}${content}`);
						})
					);
					print(formatSyncStep(steps[steps.length - 1]!));
				}
			}
		}

		if (stepName === "scripts") {
			if (config.syncScripts === false) {
				steps.push({
					capability: "local",
					step: "sync scripts",
					status: "skip",
					message: "syncScripts: false",
				});
				print(formatSyncStep(steps[steps.length - 1]!));
			} else {
				const tasksConfig: TasksConfig = { tasks: config.tasks as TasksConfig["tasks"] };
				if (config.holocronScript !== undefined) tasksConfig.holocronScript = config.holocronScript;
				const desired = createAstromech({
					cwd: input.context.repoRoot,
					config: tasksConfig,
				}).packageScripts();

				steps.push(
					await runSyncStep("local", "sync scripts", dryRun, async () => {
						const changed = await mergePackageJsonScripts(input.context.repoRoot, desired);
						if (changed === null) return "no package.json";
						if (changed.length === 0) return `${Object.keys(desired).length} scripts already current`;
						return `${changed.join(", ")} set`;
					})
				);
				print(formatSyncStep(steps[steps.length - 1]!));
			}
		}

		if (stepName === "wiki") {
			const result = await runSyncWiki({ loaded: input.loaded, context: input.context });
			steps.push(result);
			print(formatSyncStep(result));
		}
	}

	for (const s of steps) {
		logger[s.status === "fail" ? "warn" : "info"](
			{ capability: s.capability, step: s.step, status: s.status, ...(s.message ? { detail: s.message } : {}) },
			`sync: ${s.step}`
		);
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

	logger[summary.fail > 0 ? "warn" : "info"]({ ...summary }, "sync: done");

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

/**
 * Merge `desired` script entries into `package.json#scripts` — sets only the
 * listed keys, never touches the rest. Returns the sorted list of keys that
 * drifted (empty when all current), or `null` when there is no `package.json`.
 */
async function mergePackageJsonScripts(repoRoot: string, desired: Record<string, string>): Promise<string[] | null> {
	const pkgPath = join(repoRoot, "package.json");
	let content: string;
	try {
		content = await readFile(pkgPath, "utf8");
	} catch {
		return null;
	}
	const pkg = JSON.parse(content) as Record<string, unknown>;
	const scripts = (pkg.scripts ?? {}) as Record<string, string>;
	const changed: string[] = [];
	for (const [name, command] of Object.entries(desired)) {
		if (scripts[name] !== command) {
			scripts[name] = command;
			changed.push(name);
		}
	}
	if (changed.length === 0) return [];
	pkg.scripts = scripts;
	await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
	return changed.sort();
}

const README_DESC_START = "<!-- holocron:description -->";
const README_DESC_END = "<!-- /holocron:description -->";

async function updateReadmeDescription(repoRoot: string, description: string): Promise<boolean> {
	const readmePath = join(repoRoot, "README.md");
	let content: string;
	try {
		content = await readFile(readmePath, "utf8");
	} catch {
		return false;
	}
	const lines = content.split("\n");

	const startIdx = lines.findIndex((l) => l.trim() === README_DESC_START);
	const endIdx = lines.findIndex((l) => l.trim() === README_DESC_END);
	if (startIdx !== -1) {
		if (endIdx === -1 || endIdx <= startIdx) return false;
		lines.splice(startIdx + 1, endIdx - startIdx - 1, description);
		await writeFile(readmePath, lines.join("\n"), "utf8");
		return true;
	}

	const h1Index = lines.findIndex((l) => /^# /.test(l));
	if (h1Index === -1) return false;

	lines.splice(h1Index + 1, 0, "", README_DESC_START, description, README_DESC_END);
	await writeFile(readmePath, lines.join("\n"), "utf8");
	return true;
}

async function writeWorkflowFile(repoRoot: string, filename: string, content: string): Promise<void> {
	const dir = join(repoRoot, ".github", "workflows");
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, filename), content, "utf8");
}
