import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { createAstromech, createHeader, KNOWN_WORKFLOWS, readWorkspacePackages } from "@theholocron/astromech";
import type { TasksConfig } from "@theholocron/astromech/config";
import { findRootSync, isWorkspaceRoot } from "@theholocron/fs-utils";
import { stringifyJson } from "@theholocron/json-utils";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { PluginLoader, type Source } from "../../plugin/index.js";
import { withAutoPreviewDeployPaths } from "../preview-deploy-paths/index.js";
import {
	CANONICAL_LABELS,
	deriveCapabilities,
	deriveCompliance,
	deriveProfile,
	deriveStack,
	readWorkspacePackageJsons,
	type SetupReport,
	type SetupStepResult,
	STALE_LABELS,
} from "../setup/index.js";
import { assertNoPackageCollision, resolvePkgRelPath } from "../workflow-source-marker/index.js";

// The only content this file ever prefixes with workflowHeader() is thin-caller
// workflow content from astromech.thinCallers() — sync.ts just writes it. The
// actual template/generation logic a contributor would edit lives there.
const { workflowHeader } = createHeader({
	source: "cli/astromech/src/thin-callers.ts",
	tool: "holocron repo sync",
});
import { runSyncReadme } from "../sync-readme/index.js";
import { runSyncWiki } from "../sync-wiki/index.js";
import type { RunSyncInput, SyncStep } from "./sync.type.js";

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
	"turbo",
	"wiki",
] as const;

// Steps that write to the local filesystem only — no provider token needed.
const LOCAL_STEPS = new Set<SyncStep>([
	"keywords",
	"description",
	"homepage",
	"readme",
	"workflows",
	"scripts",
	"turbo",
	"wiki",
]);

export async function runSync(input: RunSyncInput): Promise<SetupReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);

	const config = input.loaded.resolved;
	const dryRun = input.context.dryRun ?? false;
	const requestedSteps = input.steps;
	const steps: SetupStepResult[] = [];
	// `--cwd` picks which holocron.config.ts to load — for a monorepo
	// subpackage (e.g. apps/sentinel) that's NOT the git repo root.
	// Anything inherently repo-wide (.github/workflows, turbo.json,
	// pnpm-workspace.yaml, the root package.json's own devDependencies,
	// "is this repo a monorepo") must resolve against the real root or it
	// silently writes into a GitHub-invisible nested .github/ instead
	// (holocron#1014) — package-local writes (this package's own
	// package.json scripts/keywords/description, its own README) stay
	// keyed to `input.context.repoRoot` (= --cwd) unchanged below.
	// `fallback: "start"` means this always resolves to a string (the start dir when
	// there is no `.git` above it); the declared `string | undefined` is the no-fallback case.
	const gitRoot = findRootSync(input.context.repoRoot, ".git", { fallback: "start", realpath: true }) as string;
	// `findRootSync` (with `realpath`) resolves symlinks and relative segments internally; a
	// plain `===` against the raw, unresolved `input.context.repoRoot`
	// would mark a real root invocation as a subpackage whenever --cwd's
	// spelling differs at all from gitRoot's resolved form (e.g. `--cwd
	// ./` at the actual root) — resolved once here for that comparison.
	// Falls back to the raw value on a nonexistent path (tests routinely
	// use a synthetic `repoRoot` like `"/tmp/test"` that's never actually
	// created) — same soft-skip `fallback: "start"` keeps.
	let resolvedRepoRoot: string;
	try {
		resolvedRepoRoot = realpathSync(input.context.repoRoot);
	} catch {
		resolvedRepoRoot = input.context.repoRoot;
	}
	// Stamped into every generated workflow file (below) so a second
	// subpackage opting into the same generic task name is detected as a
	// collision instead of silently overwriting the first's file
	// (holocron#1026). Derived from the discovered config's own directory,
	// not --cwd itself — see resolvePkgRelPath's doc comment.
	const pkgRelPath = resolvePkgRelPath(gitRoot, input.loaded.filepath);

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
					const properties: Record<string, string | string[]> = {};
					const effectivePreset = repo?.protection;
					if (effectivePreset && effectivePreset !== "none")
						properties["holocron_branch_protection_level"] = effectivePreset;
					const isMonorepo = await isWorkspaceRoot(gitRoot);
					properties["monorepo"] = String(isMonorepo);
					const manual = repo?.properties ?? {};
					if (manual.lifecycle) properties["lifecycle"] = manual.lifecycle;
					if (manual.open_source !== undefined) properties["open_source"] = String(manual.open_source);
					if (manual.runtime_environment) properties["runtime_environment"] = manual.runtime_environment;
					if (manual.uses_external_packages !== undefined)
						properties["uses_external_packages"] = String(manual.uses_external_packages);

					// #677 — derived fields, distinct from the manual ones above: signal
					// that isn't an explicit holocron.config.ts field today (framework
					// choice, repo archetype, capability drift).
					{
						const rootPackageJson = await readFile(join(gitRoot, "package.json"), "utf8")
							.then((raw) => JSON.parse(raw) as Parameters<typeof deriveStack>[0])
							.catch(() => null);
						const workspacePackages = readWorkspacePackages(gitRoot);
						const workspacePackageJsons = await readWorkspacePackageJsons(gitRoot, workspacePackages);
						properties["holocron_profile"] = deriveProfile({
							rootPackageJson,
							repoName: basename(gitRoot),
							isMonorepo,
							workspacePackageJsons,
						});
						properties["holocron_stack"] = deriveStack(rootPackageJson);
						const capabilities = deriveCapabilities(config.providers);
						properties["holocron_capabilities"] = capabilities;
						properties["holocron_compliance"] = deriveCompliance(capabilities);
					}

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

	for (const stepName of [
		"keywords",
		"description",
		"homepage",
		"readme",
		"workflows",
		"scripts",
		"turbo",
		"wiki",
	] as const) {
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
			const rawTaskEntries = config.tasks ?? [];
			// A delivery.previewDeploy entry with a non-root cwd and no explicit
			// with.paths gets one auto-computed from its workspace:* dependencies
			// (holocron#1023) -- so a PR touching an unrelated package in the
			// monorepo doesn't trigger a real Vercel preview deploy for every PR
			// regardless of relevance. A repo's own explicit with.paths always wins.
			const taskEntries =
				rawTaskEntries.length === 0 ? rawTaskEntries : withAutoPreviewDeployPaths(rawTaskEntries, gitRoot);
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
					config: { tasks: taskEntries as TasksConfig["tasks"] },
					orgContext: { org: config.org, domain: config.domain },
					logger,
				}).thinCallers();

				for (const entry of taskEntries) {
					const name = typeof entry === "string" ? entry : entry.name;
					// knowledge.docs / knowledge.components have no static
					// WORKFLOW_TEMPLATES entry (their content is always
					// combined-generated, astromech.ts) — not in KNOWN_WORKFLOWS,
					// but not "unknown" either.
					const isCombinedContentOnly = name === "knowledge.docs" || name === "knowledge.components";

					if (!KNOWN_WORKFLOWS.has(name) && !isCombinedContentOnly) {
						steps.push({
							capability: "local",
							step: `sync workflow ${name}`,
							status: "skip",
							message: `unknown workflow "${name}" — no template available`,
						});
						print(formatSyncStep(steps[steps.length - 1]!));
						continue;
					}

					// The combined-content family (delivery.deploy, knowledge.docs,
					// knowledge.components) all key their generated file by task
					// name already — no special-casing needed.
					// Keyed by task name alone, regardless of which package's
					// --cwd generated it. Two different subpackages opting into
					// the same generic task name would otherwise overwrite each
					// other's file silently (holocron#1026) — the "Source
					// package" marker (stamped below, checked by
					// assertNoPackageCollision) turns that into a loud failure
					// instead. The other half of #1026 — a template whose own
					// content bakes in repo-root-relative paths, which a non-root
					// --cwd would need rebased — doesn't apply to any current
					// WORKFLOW_TEMPLATES entry: every --cwd-eligible template
					// (delivery.previewCheck, delivery.previewDeploy) takes an
					// explicit `cwd:` `with:` input the reusable workflow itself
					// resolves, carrying no repo-root-relative content of its own.
					const filename = `${name}.yml`;
					const content = files.get(filename);
					if (content === undefined) continue; // ci: false — nothing to write

					const withPreview = content.includes("workflows/preview.yml@main");
					const step = `sync workflow ${name}${withPreview ? " (with preview)" : ""}`;
					steps.push(
						await runSyncStep("local", step, dryRun, async () => {
							await assertNoPackageCollision(name, pkgRelPath, filename, () =>
								readExistingWorkflowFile(gitRoot, filename)
							);
							await writeWorkflowFile(
								gitRoot,
								filename,
								`${workflowHeader()}# Source package: ${pkgRelPath}\n\n${content}`
							);
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
				const astromechScripts = createAstromech({
					cwd: input.context.repoRoot,
					config: tasksConfig,
					logger,
				});
				const desired = astromechScripts.packageScripts();
				// #747: which of `desired`'s keys turbo.json would fan out — the
				// only ones an existing direct-tool root script is ever protected
				// for. See mergePackageJsonScripts()'s own docstring.
				const turboContent = astromechScripts.turboConfig();
				const turboEligible = new Set<string>(
					turboContent
						? Object.keys((JSON.parse(turboContent) as { tasks: Record<string, unknown> }).tasks)
						: []
				);

				steps.push(
					await runSyncStep("local", "sync scripts", dryRun, async () => {
						const changed = await mergePackageJsonScripts(input.context.repoRoot, desired, turboEligible);
						if (changed === null) return "no package.json";
						if (changed.length === 0) return `${Object.keys(desired).length} scripts already current`;
						return `${changed.join(", ")} set`;
					})
				);
				print(formatSyncStep(steps[steps.length - 1]!));
			}
		}

		if (stepName === "turbo") {
			// turbo.json, pnpm-workspace.yaml, and the root package.json's own
			// devDependencies are each a single, whole-workspace file — one
			// subpackage's holocron.config.ts can't correctly own writing
			// them (which other subpackage's tasks would it be allowed to
			// clobber?). A monorepo subpackage sync (holocron#1014's exact
			// shape — --cwd resolves to a package, not the git root) skips
			// this entire step rather than guessing at a merge semantic; the
			// repo's own root-level sync run (where --cwd IS gitRoot) is the
			// one place these get written.
			if (resolvedRepoRoot !== gitRoot) {
				steps.push({
					capability: "local",
					step: "sync turbo.json",
					status: "skip",
					message: "--cwd is a monorepo subpackage, not the git root — run from the root to sync turbo.json",
				});
				print(formatSyncStep(steps[steps.length - 1]!));
				continue;
			}

			const astromechTurbo = createAstromech({
				cwd: input.context.repoRoot,
				config: { tasks: config.tasks as TasksConfig["tasks"] },
				logger,
			});
			const content = astromechTurbo.turboConfig();

			if (content === null) {
				steps.push({
					capability: "local",
					step: "sync turbo.json",
					status: "skip",
					message: "no fan-out-eligible tasks configured",
				});
				print(formatSyncStep(steps[steps.length - 1]!));
			} else {
				steps.push(
					await runSyncStep("local", "sync turbo.json", dryRun, async () => {
						await writeFile(join(gitRoot, "turbo.json"), content, "utf8");
					})
				);
				print(formatSyncStep(steps[steps.length - 1]!));

				// #692: fix pnpm-workspace.yaml in the same step that introduces
				// the risk — see run-setup.ts's identical wiring for the full
				// explanation.
				const rootPkgRaw = await readFile(join(gitRoot, "package.json"), "utf8").catch(() => null);
				const rootPkg = rootPkgRaw ? (JSON.parse(rootPkgRaw) as { scripts?: Record<string, string> }) : null;
				const workspaceYaml = await readFile(join(gitRoot, "pnpm-workspace.yaml"), "utf8").catch(() => "");
				const rootScripts = rootPkg?.scripts ?? {};
				const workspaceFix = astromechTurbo.ensureRootWorkspaceMember(workspaceYaml, rootScripts);
				if (workspaceFix.changed) {
					steps.push(
						await runSyncStep(
							"local",
							"fix pnpm-workspace.yaml (root workspace member, #692)",
							dryRun,
							async () => {
								await writeFile(join(gitRoot, "pnpm-workspace.yaml"), workspaceFix.content, "utf8");
							}
						)
					);
					print(formatSyncStep(steps[steps.length - 1]!));
				}

				// turbo.json alone is inert without turbo itself installed —
				// see ensureTurboDependency()'s own docstring for how this was
				// found (a global-version fallback that silently broke on an
				// unrelated turbo install).
				if (rootPkgRaw) {
					const depFix = astromechTurbo.ensureTurboDependency(rootPkgRaw, workspaceFix.content);
					if (depFix.changed) {
						steps.push(
							await runSyncStep("local", "add turbo devDependency", dryRun, async () => {
								await writeFile(join(gitRoot, "package.json"), depFix.content, "utf8");
							})
						);
						print(formatSyncStep(steps[steps.length - 1]!));
					}
				}
			}
		}

		if (stepName === "wiki") {
			// fern/docs.yml is repo-wide, same category as turbo.json —
			// runSyncWiki resolves it via context.repoRoot, so a monorepo
			// subpackage sync needs gitRoot there instead, or it looks for
			// (and fails to find) packages/<pkg>/fern/docs.yml.
			const result = await runSyncWiki({
				loaded: input.loaded,
				context: { ...input.context, repoRoot: gitRoot },
			});
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
			message: errorMessage(err),
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
	await writeFile(pkgPath, stringifyJson(pkg, { like: content }), "utf8");
	return true;
}

/**
 * Merge `desired` script entries into `package.json#scripts` — sets only the
 * listed keys, never touches the rest. Returns the sorted list of keys that
 * drifted (empty when all current), or `null` when there is no `package.json`.
 *
 * `turboEligible` (#747): task names `turbo.json` fans out — the same set
 * {@link EnsureRootWorkspaceMemberResult} above already keys off. For those
 * only, an *existing* script that isn't the generated `holocron run <task>
 * --` wrapper is left untouched: root may genuinely be a directly-buildable
 * package (not an orchestrator) with its own real command (`tsc --noEmit`,
 * `vitest run`, …) for that task. Overwriting it would silently discard the
 * real command and, once `turbo.json` exists and root is a real workspace
 * member (#692), reintroduce infinite recursion — `turbo run <task>` →
 * root's own `<task>` script → the wrapper → `holocron run <task>` sees
 * `turbo.json` still defines the task → `turbo run <task>` again, forever.
 * Every other key (non-turbo tasks, `holocron`, `prepare`, …) has no
 * legitimate direct-command alternative and stays fully generator-owned.
 */
async function mergePackageJsonScripts(
	repoRoot: string,
	desired: Record<string, string>,
	turboEligible: ReadonlySet<string>
): Promise<string[] | null> {
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
		const existing = scripts[name];
		if (turboEligible.has(name) && existing !== undefined && !isGeneratedRunWrapper(existing, name)) continue;
		if (existing !== command) {
			scripts[name] = command;
			changed.push(name);
		}
	}
	if (changed.length === 0) return [];
	pkg.scripts = scripts;
	await writeFile(pkgPath, stringifyJson(pkg, { like: content }), "utf8");
	return changed.sort();
}

/**
 * Matches the exact shape `packageScripts()` generates for `taskName` —
 * `<bin> run <taskName> --`, `<bin>` normally `holocron` but substitutable
 * (`holocronScript`, itself allowed to be multi-word, e.g. `"node
cli/cli/dist/cli.mjs"` — see its own test). Checking the *suffix*
 * rather than the whole string means an old wrapper survives a
 * `holocronScript` rename intact — it's still recognized as a wrapper (safe
 * to update to the new one), not mistaken for a real command.
 */
function isGeneratedRunWrapper(command: string, taskName: string): boolean {
	return command.endsWith(` run ${taskName} --`);
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

/**
 * Writes via a temp file + rename in the same directory, not a direct
 * `writeFile` — a monorepo subpackage sync can target the same root-level
 * file a root sync (or another subpackage's sync) also writes, and a
 * process killed mid-write would otherwise leave the live GitHub Actions
 * workflow truncated until some later sync happens to restore it. A same-
 * directory rename is atomic on POSIX filesystems, so readers only ever
 * see the old complete content or the new complete content, never a
 * partial write.
 */
async function writeWorkflowFile(repoRoot: string, filename: string, content: string): Promise<void> {
	const dir = join(repoRoot, ".github", "workflows");
	await mkdir(dir, { recursive: true });
	const tmpPath = join(dir, `.${filename}.${randomUUID()}.tmp`);
	await writeFile(tmpPath, content, "utf8");
	await rename(tmpPath, join(dir, filename));
}

/** `assertNoPackageCollision`'s local-disk read, with ENOENT mapped to "nothing there." */
async function readExistingWorkflowFile(repoRoot: string, filename: string): Promise<string | null> {
	try {
		return await readFile(join(repoRoot, ".github", "workflows", filename), "utf8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw err;
	}
}
