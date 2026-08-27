/**
 * `holocron setup` — orchestrates per-capability setup actions across
 * every plugin loaded from `holocron.config.json`.
 *
 * Per CLAUDE.md soft-skip: each step is wrapped in a try/catch and
 * failures don't abort subsequent capabilities. The summary at the end
 * reports counts so the operator can see what worked + what didn't.
 *
 * Per the Standards: when `ctx.dryRun` is true, mutating calls are
 * replaced with "would" log lines. Read-only probes (e.g.,
 * `vault.list`) still run so the operator sees real state.
 *
 * The orchestrator knows about specific capability methods by name
 * (e.g., `source.enableVulnerabilityAlerts`). This deliberate coupling
 * makes the "what does setup do" contract explicit and concrete —
 * decoupling via a per-capability `setupSteps()` method would be more
 * extensible but pushes the same knowledge into N plugins instead of
 * one central place.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readdir, readFile, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { AuthError, createFeatureResolver } from "../auth-resolver.js";
import type { Auth, Deployment, Dns, Environments, RepoSettings, Source, Tooling, Vault } from "../capabilities/index.js";
import { ProviderApiError } from "../capabilities/index.js";
import { ConfigError } from "../config.js";
import type { LoadedConfig } from "../load-config.js";
import { PluginLoader, type RuntimeContext } from "../loader.js";
import { withSpinner } from "../ui/progress.js";
import { style } from "../ui/style.js";
import {
	DEPENDABOT_CONFIG,
	deriveDeployPaths,
	extractPreviewConfig,
	generateCombinedDeployContent,
	generateThinCallerContent,
	KNOWN_WORKFLOWS,
	normalizeWorkflowWith,
	scaffoldHeader,
	WORKFLOW_CHECK_CONTEXTS,
	workflowHeader,
} from "./setup-workflows.js";

// ── .editorconfig ────────────────────────────────────────────────────
// Canonical editor settings shared across all theholocron repos.
// Kept in sync via `holocron setup` so drift (e.g. missing yaml glob)
// is corrected automatically.
function editorconfigContent(): string {
	return [
		workflowHeader("packages/cli/src/commands/setup.ts"),
		`root = true`,
		``,
		`[*]`,
		`end_of_line = lf`,
		`charset = utf-8`,
		`trim_trailing_whitespace = true`,
		`insert_final_newline = true`,
		`indent_style = tab`,
		`indent_size = 4`,
		``,
		`[.gitattributes]`,
		`indent_style = space`,
		`indent_size = 2`,
		``,
		`[*.{json,yml,yaml}]`,
		`indent_style = space`,
		`indent_size = 2`,
		``,
		`[*.{md,mdx}]`,
		`trim_trailing_whitespace = false`,
		``,
		`[.*{rc,ignore}]`,
		`indent_style = space`,
		`indent_size = 2`,
		``,
	].join("\n");
}

// ── codecov.yml ──────────────────────────────────────────────────────
// Generates the codecov.yml for a monorepo workspace. Each package under
// packages/ becomes an individual_component entry so Codecov shows
// per-package coverage in PR comments and the UI.
//
// When a codecov.yml already exists, only the individual_components block is
// replaced — everything else (coverage thresholds, comments, etc.) is left
// untouched.  The name field uses the directory slug, not the npm package name,
// so the org scope (@theholocron/) is never included.

export interface WorkspacePackage {
	slug: string;
	name: string;
}

const INDIVIDUAL_COMPONENTS_MARKER = "  individual_components:";

function codecovComponentBlock(packages: WorkspacePackage[]): string {
	if (packages.length === 0) return "\n    []\n";
	return (
		"\n" +
		packages
			.flatMap(({ slug }) => [
				`    - component_id: ${slug}`,
				`      name: "${slug}"`,
				`      paths:`,
				`        - packages/${slug}/**`,
				``,
			])
			.join("\n")
	);
}

export function mergeCodecovComponents(existing: string, packages: WorkspacePackage[]): string {
	const idx = existing.indexOf(INDIVIDUAL_COMPONENTS_MARKER);
	if (idx === -1) return existing;
	return existing.slice(0, idx + INDIVIDUAL_COMPONENTS_MARKER.length) + codecovComponentBlock(packages);
}

export function codecovContent(packages: WorkspacePackage[]): string {
	return (
		[
			scaffoldHeader(),
			`codecov:`,
			`  require_ci_to_pass: true`,
			``,
			`coverage:`,
			`  precision: 2`,
			`  round: down`,
			`  status:`,
			`    project:`,
			`      default:`,
			`        target: auto`,
			`        threshold: 2%`,
			`    patch:`,
			`      default:`,
			`        target: 80%`,
			``,
			`comment:`,
			`  layout: "reach,diff,flags,components"`,
			`  behavior: default`,
			`  require_changes: true`,
			``,
			`component_management:`,
			`  default_rules:`,
			`    statuses:`,
			`      - type: patch`,
			`        target: 80%`,
			`  individual_components:`,
		].join("\n") + codecovComponentBlock(packages)
	);
}

async function readWorkspacePackages(repoRoot: string): Promise<WorkspacePackage[]> {
	const packagesDir = join(repoRoot, "packages");
	const entries = await readdir(packagesDir, { withFileTypes: true }).catch(() => null);
	if (!entries) return [];
	const packages: WorkspacePackage[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		try {
			const raw = await readFile(join(packagesDir, entry.name, "package.json"), "utf8");
			const pkg = JSON.parse(raw) as { name?: string };
			if (typeof pkg.name === "string") {
				packages.push({ slug: entry.name, name: pkg.name });
			}
		} catch {
			// no package.json or invalid JSON — skip
		}
	}
	return packages.sort((a, b) => a.slug.localeCompare(b.slug));
}

// ── .editorconfig-checker.json ───────────────────────────────────────
// Canonical exclusions for editorconfig-checker. LICENSE files use a
// non-standard format and must be excluded; public/ is generated output.
const EDITORCONFIG_CHECKER_CONFIG =
	JSON.stringify(
		{
			Version: "v3.7.0",
			Verbose: false,
			Format: "",
			Debug: false,
			IgnoreDefaults: false,
			SpacesAfterTabs: false,
			NoColor: false,
			Exclude: ["(^|.+/)LICENSE$", "^public/.*", "\\.md$", "\\.mdx$"],
			AllowedContentTypes: [],
			PassedFiles: [],
			Disable: {
				EndOfLine: false,
				Indentation: false,
				InsertFinalNewline: false,
				TrimTrailingWhitespace: false,
				IndentSize: false,
				MaxLineLength: false,
			},
		},
		null,
		2
	) + "\n";

// ── alex config ──────────────────────────────────────────────────────
// Canonical allow-list for the alex prose linter. Shared across all
// theholocron repos via `holocron setup` so the list only needs to be
// updated here.
const ALEX_CONFIG =
	JSON.stringify({ allow: ["dead", "failure", "failures", "hook", "hooks", "husky", "period"] }, null, 2) + "\n";

// ── devmoji config ───────────────────────────────────────────────────
// Delegates to @theholocron/devmoji-config so all repos share a single
// source of truth for emoji mappings. Lives at the repo root so it is
// picked up for every package in the monorepo.
// Must be .cjs because devmoji uses require() and repos set "type":"module".
// eslint-disable comment suppresses no-undef for module.exports / require
// in ESLint flat configs that use recommended-module globals.
function devmojiConfigContent(): string {
	return [
		`/* eslint-disable */`,
		`// devmoji.config.cjs — generated by holocron setup, do not edit`,
		`// https://github.com/folke/devmoji`,
		`const { defineConfig } = require("@theholocron/devmoji-config");`,
		`module.exports = defineConfig();`,
		``,
	].join("\n");
}

// ── .husky/prepare-commit-msg hook ───────────────────────────────────
// 1. Validates that git user.name and user.email are configured.
// 2. Appends the DCO Signed-off-by trailer (required on every commit).
// 3. Runs devmoji to add an emoji to the commit subject.
//    Note: --lint is intentionally omitted. prepare-commit-msg fires before
//    the editor opens, so --lint would reject the still-empty message on
//    interactive `git commit`. Validation is handled by commitlint in commit-msg.
function prepareCommitMsgHookContent(): string {
	return [
		`#!/bin/sh`,
		``,
		`NAME=$(git config user.name)`,
		`EMAIL=$(git config user.email)`,
		``,
		`if [ -z "$NAME" ]; then`,
		`\techo "empty git config user.name"`,
		`\texit 1`,
		`fi`,
		``,
		`if [ -z "$EMAIL" ]; then`,
		`\techo "empty git config user.email"`,
		`\texit 1`,
		`fi`,
		``,
		`git interpret-trailers --if-exists doNothing --trailer \\`,
		`\t"Signed-off-by: $NAME <$EMAIL>" \\`,
		`\t--in-place "$1"`,
		``,
		`npx devmoji -e`,
		``,
	].join("\n");
}

// ── canonical label set ──────────────────────────────────────────────
// Single source of truth for labels across all theholocron repos.
// `syncLabels` (holocron-plugin-github) diffs against these and
// creates/updates/deletes as needed.
export const CANONICAL_LABELS = [
	{ name: "bug", color: "d73a4a", description: "Something isn't working" },
	{ name: "chore", color: "ededed", description: "Maintenance, no user-facing change" },
	{ name: "ci", color: "0075ca", description: "CI/CD pipeline changes" },
	{ name: "dependencies", color: "0366d6", description: "Dependency update" },
	{ name: "documentation", color: "0075ca", description: "Documentation only" },
	{ name: "duplicate", color: "cfd3d7", description: "Already reported" },
	{ name: "enhancement", color: "a2eeef", description: "New feature or request" },
	{ name: "good first issue", color: "7057ff", description: "Good for newcomers" },
	{ name: "help wanted", color: "008672", description: "Extra attention needed" },
	{ name: "invalid", color: "e4e669", description: "Doesn't seem right" },
	{ name: "performance", color: "fbca04", description: "Performance improvement" },
	{ name: "question", color: "d876e3", description: "Further information requested" },
	{ name: "refactor", color: "cfd3d7", description: "Code restructuring" },
	{ name: "released", color: "ededed", description: "Included in a release" },
	{ name: "test", color: "bfd4f2", description: "Test-related changes" },
	{ name: "triage", color: "e4e669", description: "Needs investigation" },
	{ name: "wontfix", color: "ffffff", description: "Won't be addressed" },
] as const;

export const STALE_LABELS = [
	"github_actions",
	"javascript",
	"autorelease: pending",
	"autorelease: tagged",
	"released on @alpha",
];

// ── labeler config template ──────────────────────────────────────────
// Maps Conventional Commit title prefixes to standard GitHub label names.
// Written when bookkeeping is in the workflows list; read by the
// github/issue-labeler action inside the bookkeeping reusable workflow.
// Only applied to pull requests (CC-style regexes don't suit free-form
// issue titles; sync-labels would strip manually applied labels on issues).
function labelerConfig(): string {
	return [
		workflowHeader("packages/cli/src/commands/setup.ts"),
		`bug:`,
		`  - '^fix'`,
		``,
		`chore:`,
		`  - '^chore(?!\\(deps)'`,
		``,
		`ci:`,
		`  - '^ci'`,
		``,
		`dependencies:`,
		`  - '^chore\\(deps'`,
		``,
		`documentation:`,
		`  - '^docs'`,
		``,
		`enhancement:`,
		`  - '^feat'`,
		``,
		`performance:`,
		`  - '^perf'`,
		``,
		`refactor:`,
		`  - '^refactor'`,
		``,
		`test:`,
		`  - '^test'`,
		``,
	].join("\n");
}

// ── repo policy presets ───────────────────────────────────────────────

const RULESET_NAME = "holocron-default-branch";

const BALANCED_REPO_SETTINGS: RepoSettings = {
	allow_squash_merge: true,
	allow_merge_commit: false,
	allow_rebase_merge: false,
	allow_auto_merge: true,
	allow_update_branch: true,
	delete_branch_on_merge: true,
	has_issues: true,
	has_discussions: true,
	has_projects: true,
	has_wiki: false,
	// web_commit_signoff_required is intentionally omitted: GitHub rejects this
	// field when the organization already enforces it at org level (422). Org-level
	// enforcement already covers every repo — no per-repo override is needed.
};

function buildClassicProtectionPayload(requiredChecks: string[] = []): Record<string, unknown> {
	return {
		required_status_checks: requiredChecks.length > 0 ? { strict: false, contexts: requiredChecks } : null,
		enforce_admins: false,
		required_pull_request_reviews: {
			required_approving_review_count: 0,
			dismiss_stale_reviews: false,
			require_code_owner_reviews: false,
		},
		restrictions: null,
		allow_force_pushes: false,
		allow_deletions: false,
	};
}

function buildRulesetPayload(requiredChecks: string[] = []): Record<string, unknown> {
	const rules: Record<string, unknown>[] = [
		{ type: "deletion" },
		{ type: "non_fast_forward" },
		{
			type: "pull_request",
			parameters: {
				required_approving_review_count: 0,
				dismiss_stale_reviews_on_push: false,
				require_code_owner_review: false,
				require_last_push_approval: false,
				required_review_thread_resolution: true,
			},
		},
	];
	if (requiredChecks.length > 0) {
		rules.push({
			type: "required_status_checks",
			parameters: {
				required_status_checks: requiredChecks.map((context) => ({ context })),
				strict_required_status_checks_policy: false,
			},
		});
	}
	return {
		name: RULESET_NAME,
		target: "branch",
		enforcement: "active",
		// Repository admins (role 4) can bypass — required for semantic-release
		// and other automation that pushes directly to the default branch.
		bypass_actors: [{ actor_id: 4, actor_type: "RepositoryRole", bypass_mode: "always" }],
		conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
		rules,
	};
}

// ── branch protection helper ─────────────────────────────────────────────────
// Tries the modern Rulesets API first, falls back to classic branch protection
// if rulesets return 403 (requires GitHub Team+ on private repos), and gracefully
// skips if both APIs are unavailable (GitHub Free on private repos).

async function upsertBranchProtection(
	source: Source,
	dryRun: boolean,
	requiredChecks: string[]
): Promise<SetupStepResult> {
	const step = `upsert ruleset ${RULESET_NAME}`;
	if (dryRun) return { capability: "source", step, status: "dry-run" };

	// Attempt 1: modern rulesets
	try {
		const existing = await source.listRulesets();
		const found = existing.find((r) => r.name === RULESET_NAME);
		if (found) {
			await source.updateRuleset(found.id, buildRulesetPayload(requiredChecks));
			return { capability: "source", step, status: "ok", message: "updated" };
		}
		await source.createRuleset(buildRulesetPayload(requiredChecks));
		return { capability: "source", step, status: "ok", message: "created" };
	} catch (err) {
		if (!(err instanceof ProviderApiError) || err.status !== 403) {
			return {
				capability: "source",
				step,
				status: "fail",
				message: err instanceof Error ? err.message : String(err),
			};
		}
	}

	// Attempt 2: classic branch protection (free-plan fallback)
	try {
		const repo = await source.getRepo();
		await source.protectBranch(repo.defaultBranch, buildClassicProtectionPayload(requiredChecks));
		return { capability: "source", step, status: "ok", message: `classic protection on ${repo.defaultBranch}` };
	} catch (err) {
		if (err instanceof ProviderApiError && err.status === 403) {
			return {
				capability: "source",
				step,
				status: "skip",
				message: "branch protection unavailable on private repos without GitHub Pro/Team",
			};
		}
		return {
			capability: "source",
			step,
			status: "fail",
			message: err instanceof Error ? err.message : String(err),
		};
	}
}

export type SetupPrintLine = (line: string) => void;

export type SetupStatus = "ok" | "fail" | "skip" | "dry-run";

/** Why a step failed with HTTP 403. */
export type FailReason = "permissions" | "plan";

export interface SetupStepResult {
	capability: string;
	step: string;
	status: SetupStatus;
	message?: string;
	/** Set when status === "fail" and the error was a 403. */
	reason?: FailReason;
}

export interface SetupReport {
	steps: SetupStepResult[];
	summary: { ok: number; fail: number; skip: number; dryRun: number };
}

export interface RunSetupInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Lets tests inject a pre-loaded loader; defaults to native dynamic import. */
	loader?: PluginLoader;
	print?: SetupPrintLine;
	/** Injectable keyring backend. Tests pass `() => null` to skip real OS keychain lookups. */
	keyring?: (key: string) => string | null;
}

export async function runSetup(input: RunSetupInput): Promise<SetupReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await withSpinner("Loading plugins…", () => loader.load());

	const config = input.loaded.resolved;
	const dryRun = input.context.dryRun ?? false;
	const steps: SetupStepResult[] = [];
	const repo = config.repo;
	const effectivePreset = repo?.protection;

	print(style.header(`Holocron setup — ${config.name}${dryRun ? " (dry-run)" : ""}`));
	print(style.dim(`  config: ${input.loaded.filepath}`));
	print("");

	// ── source: security toggles + repo policy ──────────────────────────
	if (loader.has("source")) {
		const source = loader.get("source") as Source;
		print(style.step("source"));
		// Secret scanning on public repos is always on (422); private vuln
		// reporting doesn't exist on public repos (404). Treat both as skip so
		// a public-repo setup doesn't report spurious failures.
		const SECURITY_SKIP_CODES: Partial<Record<string, number[]>> = {
			enableSecretScanning: [422],
			enablePrivateVulnerabilityReporting: [404],
		};
		for (const method of [
			"enableVulnerabilityAlerts",
			"enableAutomatedSecurityFixes",
			"enableSecretScanning",
			"enablePrivateVulnerabilityReporting",
			"enableDependencyGraph",
		] as const) {
			steps.push(
				await runStep(
					"source",
					method,
					dryRun,
					async () => {
						await source[method]();
					},
					{ skipCodes: SECURITY_SKIP_CODES[method] }
				)
			);
			print(formatStep(steps[steps.length - 1]!));
		}

		const usesAdvancedCodeQL = (config.workflows ?? [])
			.map((e) => (typeof e === "string" ? e : e.name))
			.includes("codeql");
		steps.push(
			await runStep(
				"source",
				usesAdvancedCodeQL ? "disableDefaultCodeScanning" : "enableCodeScanning",
				dryRun,
				async () => {
					if (usesAdvancedCodeQL) {
						await source.disableDefaultCodeScanning();
					} else {
						return await source.enableCodeScanning();
					}
				}
			)
		);
		print(formatStep(steps[steps.length - 1]!));

		if (effectivePreset && effectivePreset !== "none") {
			steps.push(
				await runStep("source", "updateRepoSettings", dryRun, async () => {
					await source.updateRepoSettings(BALANCED_REPO_SETTINGS);
				})
			);
			print(formatStep(steps[steps.length - 1]!));

			const configuredWorkflowNames = [
				...new Set((config.workflows ?? []).map((entry) => (typeof entry === "string" ? entry : entry.name))),
			];
			const requiredChecks =
				effectivePreset === "strict"
					? [
							"DCO",
							...configuredWorkflowNames.flatMap((name) => {
								const ctx = WORKFLOW_CHECK_CONTEXTS[name];
								return ctx ? [ctx] : [];
							}),
							...(repo?.requiredChecks ?? []),
						]
					: [];
			steps.push(await upsertBranchProtection(source, dryRun, requiredChecks));
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── source: workflow thin wrappers ──────────────────────────────────
	// normalizeWorkflowWith and deriveDeployPaths are imported from setup-workflows.ts
	// so they're shared with sync-github.ts.

	const workflows = config.workflows;
	if (loader.has("source") && workflows && workflows.length > 0) {
		const source = loader.get("source") as Source;
		print(style.step("workflows"));
		for (const entry of workflows) {
			const name = typeof entry === "string" ? entry : entry.name;
			const rawWith = typeof entry === "object" ? entry.with : undefined;
			const withOverrides = rawWith ? normalizeWorkflowWith(rawWith) : undefined;
			const explicitPaths = typeof entry === "object" ? entry.paths : undefined;
			const additionalPaths =
				explicitPaths ??
				(name === "deploy" && rawWith ? deriveDeployPaths(rawWith as Record<string, unknown>) : undefined);

			// Enforce that the test workflow has at least one test type enabled.
			// This check lives here so it fails at setup time rather than silently
			// producing a CI job that never runs any tests.
			if (name === "test" && withOverrides) {
				const runUnit = withOverrides["run-unit"];
				const runStorybook = withOverrides["run-storybook"];
				const unitDisabled = runUnit === false;
				const storybookDisabled = runStorybook === false;
				const neitherEnabled = unitDisabled && storybookDisabled;
				if (neitherEnabled) {
					throw new ConfigError(
						'test workflow: at least one of "run-unit" or "run-storybook" must be true. ' +
							"Library repos use run-unit: true; UI/Storybook repos use run-storybook: true."
					);
				}
			}

			if (!KNOWN_WORKFLOWS.has(name)) {
				steps.push({
					capability: "source",
					step: `write workflow ${name}`,
					status: "skip",
					message: `unknown workflow "${name}" — no template available`,
				});
				print(formatStep(steps[steps.length - 1]!));
				continue;
			}

			// deploy + preview: → combined thin caller (single file, two jobs).
			// preview: true derives project + domain from config.org / config.docs.
			if (name === "deploy" && rawWith) {
				const previewCfg = extractPreviewConfig(rawWith as Record<string, unknown>, {
					org: config.org,
					docsDomain: config.docs?.domain,
				});
				if (previewCfg) {
					const paths = additionalPaths ?? [];
					steps.push(
						await runStep("source", "write workflow deploy (with preview)", dryRun, async () => {
							await source.writeWorkflowFile(
								"deploy.yml",
								workflowHeader() + generateCombinedDeployContent(withOverrides ?? {}, paths, previewCfg)
							);
						})
					);
					print(formatStep(steps[steps.length - 1]!));
					continue;
				}
			}

			steps.push(
				await runStep("source", `write workflow ${name}`, dryRun, async () => {
					await source.writeWorkflowFile(
						`${name}.yml`,
						workflowHeader() + generateThinCallerContent(name, withOverrides, additionalPaths)
					);
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── source: labeler config ───────────────────────────────────────────
	if (
		loader.has("source") &&
		(config.workflows ?? []).map((e) => (typeof e === "string" ? e : e.name)).includes("bookkeeping")
	) {
		const source = loader.get("source") as Source;
		steps.push(
			await runStep("source", "write .github/labeler.yml", dryRun, async () => {
				await source.writeRepoFile(".github/labeler.yml", labelerConfig());
			})
		);
		print(formatStep(steps[steps.length - 1]!));
	}

	// ── source: dependabot config ────────────────────────────────────────
	if (loader.has("source") && effectivePreset !== "none") {
		const source = loader.get("source") as Source;
		steps.push(
			await runStep("source", "write .github/dependabot.yml", dryRun, async () => {
				await source.writeRepoFile(
					".github/dependabot.yml",
					workflowHeader("packages/cli/src/commands/setup.ts") + DEPENDABOT_CONFIG
				);
			})
		);
		print(formatStep(steps[steps.length - 1]!));
	}

	// ── source: alex config ───────────────────────────────────────────────
	// Always written — not gated on protection since all prose benefits from
	// a consistent allow-list. Update ALEX_CONFIG above to propagate changes.
	if (loader.has("source")) {
		const source = loader.get("source") as Source;
		steps.push(
			await runStep("source", "write .alexrc.json", dryRun, async () => {
				await source.writeRepoFile(".alexrc.json", ALEX_CONFIG);
			})
		);
		print(formatStep(steps[steps.length - 1]!));
		steps.push(
			await runStep("source", "write .editorconfig", dryRun, async () => {
				await source.writeRepoFile(".editorconfig", editorconfigContent());
			})
		);
		print(formatStep(steps[steps.length - 1]!));
		steps.push(
			await runStep("source", "write .editorconfig-checker.json", dryRun, async () => {
				await source.writeRepoFile(".editorconfig-checker.json", EDITORCONFIG_CHECKER_CONFIG);
			})
		);
		print(formatStep(steps[steps.length - 1]!));
		steps.push(
			await runStep("source", "write devmoji.config.cjs", dryRun, async () => {
				await source.writeRepoFile("devmoji.config.cjs", devmojiConfigContent());
			})
		);
		print(formatStep(steps[steps.length - 1]!));
		steps.push(
			await runStep("source", "write .husky/prepare-commit-msg", dryRun, async () => {
				await source.writeRepoFile(".husky/prepare-commit-msg", prepareCommitMsgHookContent());
			})
		);
		print(formatStep(steps[steps.length - 1]!));
		{
			const configuredWorkflowNames = (config.workflows ?? []).map((e) => (typeof e === "string" ? e : e.name));
			const hasTestWorkflow = configuredWorkflowNames.includes("test");
			const packages = await readWorkspacePackages(input.context.repoRoot);
			const existing = await readFile(join(input.context.repoRoot, "codecov.yml"), "utf8").catch(() => null);
			if (!hasTestWorkflow && existing == null) {
				steps.push({
					capability: "source",
					step: "write codecov.yml",
					status: "skip",
					message: "no test workflow configured",
				});
			} else {
				steps.push(
					await runStep("source", "write codecov.yml", dryRun, async () => {
						const content =
							existing != null ? mergeCodecovComponents(existing, packages) : codecovContent(packages);
						await source.writeRepoFile("codecov.yml", content);
						return packages.length > 0 ? `${packages.length} components` : "no components";
					})
				);
			}
			print(formatStep(steps[steps.length - 1]!));
		}

		if (source.syncLabels) {
			steps.push(
				await runStep("source", "sync labels", dryRun, async () => {
					return source.syncLabels!(CANONICAL_LABELS, STALE_LABELS);
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}

		const properties: Record<string, string> = {};

		if (effectivePreset && effectivePreset !== "none") properties["branch_protection_level"] = effectivePreset;

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

		if (source.syncProperties) {
			steps.push(await runStep("source", "sync properties", dryRun, () => source.syncProperties!(properties)));
			print(formatStep(steps[steps.length - 1]!));
		}

		const topics = repo?.topics ?? [];
		if (topics.length > 0 && source.syncTopics) {
			steps.push(await runStep("source", "sync topics", dryRun, () => source.syncTopics!(topics)));
			print(formatStep(steps[steps.length - 1]!));
		}

		if (config.description && source.syncDescription) {
			steps.push(
				await runStep("source", "sync description", dryRun, () => source.syncDescription!(config.description!))
			);
			print(formatStep(steps[steps.length - 1]!));
		}

		if (config.homepage && source.syncHomepage) {
			steps.push(await runStep("source", "sync homepage", dryRun, () => source.syncHomepage!(config.homepage!)));
			print(formatStep(steps[steps.length - 1]!));
		}

		const teams = repo?.teams ?? [];
		if (teams.length > 0) {
			if (source.syncTeams) {
				// 422 means the team is already assigned — desired state is in place,
				// so treat it as an idempotent success (skip) rather than a failure.
				steps.push(
					await runStep("source", "sync teams", dryRun, () => source.syncTeams!(teams), { skipCodes: [422] })
				);
				print(formatStep(steps[steps.length - 1]!));

				// Only split on "/" so a bare repo name (no owner prefix) yields an
				// empty org and silently skips the CODEOWNERS write rather than
				// producing an invalid "* @reponame/slug" entry.
				const repoCoord = input.context.repo ?? repo?.name ?? "";
				const org = repoCoord.includes("/") ? repoCoord.split("/")[0]! : "";
				const writeableTeams = teams
					.map((t) => (typeof t === "string" ? { slug: t, permission: "push" as const } : t))
					.filter((t) => ["push", "maintain", "admin"].includes(t.permission));
				if (org && writeableTeams.length > 0) {
					steps.push(
						await runStep("source", "write .github/CODEOWNERS", dryRun, async () => {
							const content = writeableTeams.map((t) => `* @${org}/${t.slug}`).join("\n") + "\n";
							await source.writeRepoFile(".github/CODEOWNERS", content);
						})
					);
					print(formatStep(steps[steps.length - 1]!));
				}
			} else {
				steps.push({
					capability: "source",
					step: "sync teams",
					status: "skip",
					message: "provider does not implement syncTeams",
				});
				print(formatStep(steps[steps.length - 1]!));
			}
		}
	}

	// ── environments ────────────────────────────────────────────────────
	if (loader.has("environments")) {
		const envs = loader.get("environments") as Environments;
		print(style.step("environments"));
		for (const envName of ["staging", "production"]) {
			steps.push(
				await runStep("environments", `upsert ${envName}`, dryRun, async () => {
					await envs.upsertEnvironment({ name: envName });
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── docs: configure GitHub Pages ────────────────────────────────────
	if (loader.has("source") && config.docs) {
		const source = loader.get("source") as Source;
		const resolveDeployToken = createFeatureResolver({
			envName: "HOLOCRON_DEPLOY_TOKEN",
			keyringKey: "github.deploy",
		});
		let deployToken: string | undefined;
		try {
			deployToken = resolveDeployToken({ keyring: input.keyring });
		} catch (err) {
			if (!(err instanceof AuthError)) throw err;
		}
		print(style.step("docs"));
		if (!deployToken) {
			steps.push({
				capability: "source",
				step: "configure GitHub Pages",
				status: "skip",
				message:
					"no deploy token found — set HOLOCRON_DEPLOY_TOKEN or run: holocron auth set github.deploy <PAT>",
			});
			print(formatStep(steps[steps.length - 1]!));
		} else if (source.configurePages) {
			steps.push(
				await runStep("source", "configure GitHub Pages", dryRun, async () => {
					await source.configurePages!(config.docs!, deployToken);
					const parts: string[] = [config.docs!.build];
					if (config.docs!.domain) parts.push(`domain: ${config.docs!.domain}`);
					if (config.docs!.https) parts.push("https: enforced");
					return parts.join(", ");
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── deployment: ensure project + preview infrastructure ─────────────
	if (loader.has("deployment")) {
		const deploy = loader.get("deployment") as Deployment;
		print(style.step("deployment"));
		steps.push(
			await runStep("deployment", `ensureProject ${config.name}`, dryRun, async () => {
				await deploy.ensureProject({ name: config.name });
			})
		);
		print(formatStep(steps[steps.length - 1]!));

		// When the deploy workflow has preview: { project, domain }, provision the
		// Cloudflare Pages custom domain so preview URLs resolve at
		// <repo>-pr-<n>.<domain> — dogfooding our own deployment + dns capabilities.
		const deployEntry = (config.workflows ?? [])
			.map((e) => (typeof e === "string" ? { name: e } : e))
			.find((e) => e.name === "deploy");
		const previewCfg = deployEntry?.with ? extractPreviewConfig(deployEntry.with as Record<string, unknown>) : null;

		if (previewCfg?.domain && deploy.ensureCustomDomain) {
			const wildcardDomain = `*.${previewCfg.domain}`;
			steps.push(
				await runStep("deployment", `ensureCustomDomain ${wildcardDomain}`, dryRun, async () => {
					await deploy.ensureCustomDomain!(previewCfg.project, wildcardDomain);
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}

		if (previewCfg?.domain && loader.has("dns")) {
			const dns = loader.get("dns") as Dns;
			const wildcardDomain = `*.${previewCfg.domain}`;
			steps.push(
				await runStep("dns", `upsertRecord ${wildcardDomain}`, dryRun, async () => {
					await dns.upsertRecord(previewCfg.domain!, {
						type: "CNAME",
						name: wildcardDomain,
						content: `${previewCfg.project}.pages.dev`,
						ttl: 1,
					});
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── auth: ensure webhook app (optional method) ──────────────────────
	if (loader.has("auth")) {
		const auth = loader.get("auth") as Auth;
		print(style.step("auth"));
		if (auth.ensureWebhookApp) {
			steps.push(
				await runStep("auth", "ensureWebhookApp", dryRun, async () => {
					const result = await auth.ensureWebhookApp!();
					return `webhook ${result.alreadyExists ? "exists" : "created"}`;
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		} else {
			steps.push({
				capability: "auth",
				step: "ensureWebhookApp",
				status: "skip",
				message: "provider does not implement ensureWebhookApp",
			});
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── vault: bootstrap project + configs, then read-only probe ───────
	if (loader.has("vault")) {
		const vault = loader.get("vault") as Vault;
		print(style.step("vault"));

		// ensureProject — providers that have a top-level container.
		if (vault.ensureProject) {
			steps.push(
				await runStep("vault", `ensureProject ${config.name}`, dryRun, async () => {
					const result = await vault.ensureProject!(config.name);
					return `project ${result.alreadyExists ? "exists" : "created"}`;
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}

		// ensureEnvironment — providers with a project/config split
		// (Doppler configs, Infisical environments, etc.). Canonical
		// names; per-project overrides live in the plugin's options.
		if (vault.ensureEnvironment) {
			for (const envName of ["dev", "stg", "prd"]) {
				steps.push(
					await runStep("vault", `ensureEnvironment ${envName}`, dryRun, async () => {
						const result = await vault.ensureEnvironment!(config.name, envName);
						return `${envName} ${result.alreadyExists ? "exists" : "created"}`;
					})
				);
				print(formatStep(steps[steps.length - 1]!));
			}
		}

		// Read-only reachability probe. Runs even under --dry-run.
		try {
			const keys = await vault.list();
			steps.push({
				capability: "vault",
				step: "list",
				status: "ok",
				message: `${keys.length} keys available`,
			});
		} catch (err) {
			steps.push({
				capability: "vault",
				step: "list",
				status: "fail",
				message: err instanceof Error ? err.message : String(err),
			});
		}
		print(formatStep(steps[steps.length - 1]!));
	}

	// ── tooling: sync each (many cardinality) ───────────────────────────
	if (loader.has("tooling")) {
		const tools = loader.get("tooling") as Tooling[];
		print(style.step("tooling"));
		for (const tool of tools) {
			steps.push(
				await runStep("tooling", `${tool.providerName}.sync`, dryRun, async () => {
					await tool.sync();
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── skills: install agent skills from registry ──────────────────────
	// Pure local fs operation — no source plugin required. Reads skill dirs
	// from the installed @theholocron/skills package and copies them to the
	// agent-specific location, then gitignores the installed paths.
	if (config.skills && config.skills.length > 0 && config.agent) {
		print(style.step("skills"));
		if (!(config.agent in AGENT_SYMLINK_PATHS)) {
			steps.push({
				capability: "skills",
				step: "install skills",
				status: "skip",
				message: `agent "${config.agent}" has no known skill install path`,
			});
		} else {
			steps.push(
				await runStep("skills", "install skills", dryRun, async () => {
					return await installSkills({
						agent: config.agent!,
						skills: config.skills!,
						repoRoot: input.context.repoRoot,
					});
				})
			);
		}
		print(formatStep(steps[steps.length - 1]!));
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
	const summaryLine = `  ${summary.ok} ok, ${summary.fail} fail, ${summary.skip} skipped${
		dryRun ? `, ${summary.dryRun} would-do` : ""
	}`;
	print(summary.fail > 0 ? style.fail(summaryLine.trim()) : style.success(summaryLine.trim()));

	const skippedSteps = steps.filter((s) => s.status === "skip");
	if (skippedSteps.length > 0) {
		print("");
		print(style.hint("  Skipped:"));
		for (const s of skippedSteps) {
			/* v8 ignore next -- all skip steps set message; empty fallback is defensive */
			print(style.hint(`    · ${s.step}${s.message ? `  (${s.message})` : ""}`));
		}
	}

	if (steps.some((s) => s.reason === "permissions")) {
		print("");
		print(style.warn("Some steps failed with 403 (insufficient token permissions)."));
		print(style.hint("     Repo-scoped operations (rulesets, settings, workflows) require a"));
		print(style.hint("     fine-grained PAT passed via --token or HOLOCRON_ADMIN_TOKEN:"));
		print("");
		print(style.hint("       · Administration          — read and write"));
		print(style.hint("       · Code scanning alerts    — read and write"));
		print(style.hint("       · Contents                — read and write"));
		print(style.hint("       · Secret scanning alerts  — read and write"));
		print(style.hint("       · Workflows               — read and write"));
		print(style.hint("       · Metadata                — read (added automatically)"));
		print("");
		print(style.hint("     Org-scoped operations (teams, custom properties) require"));
		print(style.hint("     HOLOCRON_ORG_TOKEN — a fine-grained PAT with resource owner set to the org:"));
		print("");
		print(style.hint("       · Administration          — read and write (repository permission)"));
		print(style.hint("       · Members                 — read (organization permission)"));
		print(style.hint("       · Organization custom properties — read and write (organization permission)"));
		print(style.hint("       · Metadata                — read (repository permission, auto-included)"));
		print("");
		print(style.hint("     Create tokens at: https://github.com/settings/personal-access-tokens/new"));
		print(style.hint("     Then re-run:      holocron setup --token <your-admin-pat>"));
		print(style.hint("     Store org token:  HOLOCRON_ORG_TOKEN env var or keyring key github.org"));
	}

	return { steps, summary };
}

// ── skills installer ─────────────────────────────────────────────────
// Canonical location: .agents/skills/<name>/
// Agent symlinks:    .<agent>/skills/<name> → relative path into .agents/
// Pattern mirrors the `npx skills add` CLI (skills.sh) for multi-agent compat.

interface SkillLockEntry {
	source: string;
	sourceType: "github";
	skillPath: string;
	computedHash?: string;
}

interface SkillsLock {
	version: number;
	skills: Record<string, SkillLockEntry>;
}

/**
 * Fetch a single SKILL.md from its upstream GitHub source.
 * Verifies the SHA-256 hash when `computedHash` is present in the lock entry.
 */
async function fetchExternalSkill(entry: SkillLockEntry): Promise<{ content: string; stale: boolean }> {
	if (entry.sourceType !== "github") {
		throw new Error(`unsupported sourceType: ${entry.sourceType}`);
	}
	const url = `https://raw.githubusercontent.com/${entry.source}/HEAD/${entry.skillPath}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
	const content = await res.text();
	// A hash mismatch means the upstream file changed since the lock was recorded.
	// Install anyway and surface via "stale:" so the user knows to run
	// `holocron skills update` to refresh the lock.
	const stale = !!entry.computedHash && createHash("sha256").update(content).digest("hex") !== entry.computedHash;
	return { content, stale };
}

const AGENTS_SKILLS_ROOT = ".agents/skills";

/** Relative path of the agent-specific symlink. undefined = unsupported agent. */
const AGENT_SYMLINK_PATHS: Partial<Record<string, (name: string) => string>> = {
	claude: (name) => `.claude/skills/${name}`,
};

const GITIGNORE_BLOCK_START = "# managed by holocron setup — skills";
// Safety invariant: GITIGNORE_BLOCK_START must NOT be a substring of
// GITIGNORE_BLOCK_END. The "# end " prefix currently guarantees this — if
// either string is edited, verify the invariant still holds so that
// indexOf(GITIGNORE_BLOCK_START) cannot match inside the end marker.
const GITIGNORE_BLOCK_END = "# end managed by holocron setup — skills";

export async function installSkills({
	agent,
	skills,
	repoRoot,
}: {
	agent: string;
	skills: string[];
	repoRoot: string;
}): Promise<string> {
	const symlinkFn = AGENT_SYMLINK_PATHS[agent];
	if (!symlinkFn) {
		return `agent "${agent}" has no known skill install path — skipping`;
	}

	// Locate @theholocron/skills relative to the consumer repo.
	// Uses ./package.json subpath — must be declared in the package exports map.
	// Auto-installs if not present rather than failing with a manual instruction.
	const require = createRequire(pathToFileURL(join(repoRoot, "package.json")));
	let skillsRoot: string;
	try {
		skillsRoot = dirname(require.resolve("@theholocron/skills/package.json"));
	} catch {
		const result = spawnSync("pnpm", ["add", "-D", "@theholocron/skills"], {
			cwd: repoRoot,
			stdio: "inherit",
		});
		if (result.status !== 0) {
			throw new Error("failed to auto-install @theholocron/skills");
		}
		try {
			skillsRoot = dirname(require.resolve("@theholocron/skills/package.json"));
		} catch {
			throw new Error("failed to auto-install @theholocron/skills");
		}
	}

	// Find which skills from the previous run are no longer wanted (prune stale).
	const gitignorePath = join(repoRoot, ".gitignore");
	const existingContent = await readFile(gitignorePath, "utf8").catch(() => "");
	const previouslyInstalled = parsePreviousSkills(existingContent, symlinkFn);
	const currentSet = new Set(skills);
	const stale = previouslyInstalled.filter((n) => !currentSet.has(n));
	for (const name of stale) {
		await rm(join(repoRoot, symlinkFn(name)), { force: true }).catch(() => undefined);
		await rm(join(repoRoot, AGENTS_SKILLS_ROOT, name), { recursive: true, force: true }).catch(() => undefined);
	}

	const installed: string[] = [];
	const missing: string[] = [];

	for (const name of skills) {
		const srcDir = join(skillsRoot, "src", name);

		try {
			await stat(srcDir);
		} catch {
			missing.push(name);
			continue;
		}

		// 1. Copy recursively to .agents/skills/<name>/ (handles nested reference dirs)
		const agentsDir = join(repoRoot, AGENTS_SKILLS_ROOT, name);
		await copyDirRecursive(srcDir, agentsDir);

		// 2. Relative symlink at agent-specific path → .agents/skills/<name>
		const symlinkPath = join(repoRoot, symlinkFn(name));
		await mkdir(dirname(symlinkPath), { recursive: true });
		try {
			await unlink(symlinkPath);
		} catch {
			// didn't exist — that's fine
		}
		// Forward slashes in symlink target (posix-compatible on all platforms)
		await symlink(relative(dirname(symlinkPath), agentsDir).replace(/\\/g, "/"), symlinkPath);

		installed.push(name);
	}

	// ── external skills: fetch from upstream sources in skills-lock.json ─────
	const externalFailed: string[] = [];
	const externalStale: string[] = [];
	if (missing.length > 0) {
		let lock: SkillsLock | null = null;
		try {
			lock = JSON.parse(await readFile(join(skillsRoot, "skills-lock.json"), "utf8")) as SkillsLock;
		} catch {
			// No lock file or parse error — all missing remain unknown.
		}
		if (lock?.skills) {
			for (const name of [...missing]) {
				const entry = lock.skills[name];
				if (!entry) continue;
				try {
					const { content, stale: isStale } = await fetchExternalSkill(entry);
					const agentsDir = join(repoRoot, AGENTS_SKILLS_ROOT, name);
					await mkdir(agentsDir, { recursive: true });
					await writeFile(join(agentsDir, "SKILL.md"), content);
					const symlinkPath = join(repoRoot, symlinkFn(name));
					await mkdir(dirname(symlinkPath), { recursive: true });
					try {
						await unlink(symlinkPath);
					} catch {
						// didn't exist — that's fine
					}
					await symlink(relative(dirname(symlinkPath), agentsDir).replace(/\\/g, "/"), symlinkPath);
					missing.splice(missing.indexOf(name), 1);
					installed.push(name);
					if (isStale) externalStale.push(name);
				} catch {
					missing.splice(missing.indexOf(name), 1);
					externalFailed.push(name);
				}
			}
		}
	}

	// Include all installed + still-unknown + failed skills in the gitignore.
	if (installed.length > 0 || stale.length > 0 || missing.length > 0 || externalFailed.length > 0) {
		await updateSkillsGitignore(
			gitignorePath,
			existingContent,
			[...installed, ...missing, ...externalFailed],
			symlinkFn
		);
	}

	const parts: string[] = [`installed ${installed.length}`];
	if (stale.length > 0) parts.push(`pruned: ${stale.join(", ")}`);
	if (externalStale.length > 0)
		parts.push(`stale: ${externalStale.join(", ")} (run \`holocron skills update\` to refresh)`);
	if (externalFailed.length > 0) parts.push(`fetch failed: ${externalFailed.join(", ")}`);
	if (missing.length > 0) parts.push(`unknown: ${missing.join(", ")}`);
	return parts.join("; ");
}

/** Extract skill names from the previous gitignore block so stale dirs can be pruned. */
function parsePreviousSkills(gitignoreContent: string, symlinkFn: (n: string) => string): string[] {
	if (!gitignoreContent.includes(GITIGNORE_BLOCK_START)) return [];
	const startIdx = gitignoreContent.indexOf(GITIGNORE_BLOCK_START);
	const endIdx = gitignoreContent.indexOf(GITIGNORE_BLOCK_END, startIdx);
	const block = endIdx !== -1 ? gitignoreContent.slice(startIdx, endIdx) : gitignoreContent.slice(startIdx);
	// Derive the symlink prefix by calling symlinkFn with a placeholder and removing it
	const placeholder = "__placeholder__";
	const symlinkPrefix = `/${symlinkFn(placeholder)}`.replace(placeholder, "");
	return block
		.split("\n")
		.filter((line) => line.startsWith(symlinkPrefix))
		.map((line) => line.slice(symlinkPrefix.length));
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
	await mkdir(dest, { recursive: true });
	const entries = await readdir(src, { withFileTypes: true });
	for (const entry of entries) {
		const srcPath = join(src, entry.name);
		const destPath = join(dest, entry.name);
		if (entry.isDirectory()) {
			await copyDirRecursive(srcPath, destPath);
		} else {
			await copyFile(srcPath, destPath);
		}
	}
}

async function updateSkillsGitignore(
	gitignorePath: string,
	existingContent: string,
	skills: string[],
	symlinkFn: (name: string) => string
): Promise<void> {
	// Always use forward slashes in gitignore (posix paths regardless of OS)
	const entries = [`/${AGENTS_SKILLS_ROOT}/`, ...skills.map((n) => `/${symlinkFn(n)}`)];
	const block = [GITIGNORE_BLOCK_START, ...entries, GITIGNORE_BLOCK_END].join("\n");

	let content: string;
	if (existingContent.includes(GITIGNORE_BLOCK_START)) {
		const start = existingContent.indexOf(GITIGNORE_BLOCK_START);
		const end = existingContent.indexOf(GITIGNORE_BLOCK_END, start);
		// Without an end marker we cannot tell where managed entries stop and user
		// content begins, so just close the new block with a newline and discard
		// the orphaned entries rather than risk corrupting the file.
		const afterBlock = end !== -1 ? existingContent.slice(end + GITIGNORE_BLOCK_END.length) : "\n";
		content = existingContent.slice(0, start) + block + afterBlock;
	} else {
		content = (existingContent.trimEnd() ? existingContent.trimEnd() + "\n\n" : "") + block + "\n";
	}

	await writeFile(gitignorePath, content, "utf8");
}

// ── helpers ──────────────────────────────────────────────────────────

async function runStep(
	capability: string,
	step: string,
	dryRun: boolean,
	body: () => Promise<string | void>,
	opts: { skipCodes?: number[] } = {}
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
		if (err instanceof ProviderApiError) {
			if (err.status !== undefined && opts.skipCodes?.includes(err.status)) {
				return { capability, step, status: "skip", message: err.message };
			}
			if (err.status === 403) {
				const reason = classify403(err);
				// Plan-restriction 403s mean the feature is unavailable on the current
				// plan — not a setup failure, just a capability gap. Report as skip.
				return { capability, step, status: reason === "plan" ? "skip" : "fail", message: err.message, reason };
			}
		}
		return {
			capability,
			step,
			status: "fail",
			message: err instanceof Error ? err.message : String(err),
		};
	}
}

function classify403(err: ProviderApiError): FailReason {
	const detailText =
		typeof err.details === "string"
			? err.details
			: typeof err.details === "object" && err.details !== null && "message" in err.details
				? String((err.details as { message?: unknown }).message)
				: "";
	const text = `${err.message} ${detailText}`.toLowerCase();
	if (
		text.includes("advanced security") ||
		text.includes("not enabled for this repository") ||
		text.includes("upgrade") ||
		text.includes("not available on")
	) {
		return "plan";
	}
	return "permissions";
}

function formatStep(step: SetupStepResult): string {
	const tag = step.reason === "permissions" ? " [permissions]" : step.reason === "plan" ? " [plan restriction]" : "";
	const detail = step.message ? style.dim(`  (${step.message})`) : "";
	const label = `${step.step}${tag}${detail}`;
	if (step.status === "ok") return `    ${style.success(label)}`;
	if (step.status === "fail") return `    ${style.fail(label)}`;
	if (step.status === "dry-run") return `    ${style.dim(`… ${label}`)}`;
	return `    ${style.dim(`· ${label}`)}`;
}
