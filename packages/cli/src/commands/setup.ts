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

import { access } from "node:fs/promises";
import { join } from "node:path";

import type { Auth, Deployment, Environments, RepoSettings, Source, Tooling, Vault } from "../capabilities/index.js";
import { ProviderApiError } from "../capabilities/index.js";
import type { LoadedConfig } from "../load-config.js";
import { PluginLoader, type RuntimeContext } from "../loader.js";
import {
	workflowHeader,
	KNOWN_WORKFLOWS,
	generateThinCallerContent,
	WORKFLOW_CHECK_CONTEXTS,
} from "./setup-workflows.js";

// ── .editorconfig ────────────────────────────────────────────────────
// Canonical editor settings shared across all theholocron repos.
// Kept in sync via `holocron setup` so drift (e.g. missing yaml glob)
// is corrected automatically.
function editorconfigContent(): string {
	return [
		`# AUTO-GENERATED — do not edit directly.`,
		`# Source:  theholocron/holocron · packages/cli/src/commands/setup.ts`,
		`# Synced:  ${new Date().toISOString()}`,
		`# Tool:    holocron setup`,
		`# Changes: run \`holocron setup\` to regenerate.`,
		``,
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
		`[*.md]`,
		`trim_trailing_whitespace = false`,
		`indent_style = space`,
		`indent_size = 2`,
		``,
		`[.*{rc,ignore}]`,
		`indent_style = space`,
		`indent_size = 2`,
		``,
	].join("\n");
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
			Exclude: ["(^|.+/)LICENSE$", "^public/.*"],
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
// Written when bookkeeping-pr is in the workflows list; read by the
// github/issue-labeler action inside the bookkeeping-pr reusable workflow.
function labelerConfig(): string {
	return [
		`# AUTO-GENERATED — do not edit directly.`,
		`# Source:  theholocron/holocron · packages/cli/src/commands/setup.ts`,
		`# Synced:  ${new Date().toISOString()}`,
		`# Tool:    holocron setup`,
		`# Changes: run \`holocron setup\` to regenerate.`,
		``,
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

// ── dependabot config template ───────────────────────────────────────
const DEPENDABOT_CONFIG = `\
# AUTO-GENERATED by holocron — run \`holocron setup\` to regenerate.
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      security-patches:
        applies-to: security-updates
        patterns:
          - "*"
      all-dependencies:
        update-types:
          - minor
          - patch

  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    groups:
      all-actions:
        patterns:
          - "*"
`;

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
				required_review_thread_resolution: false,
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

export interface SetupStepResult {
	capability: string;
	step: string;
	status: SetupStatus;
	message?: string;
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
}

export async function runSetup(input: RunSetupInput): Promise<SetupReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();

	const config = input.loaded.resolved;
	const dryRun = input.context.dryRun ?? false;
	const steps: SetupStepResult[] = [];
	const repo = config.project.repo;
	const effectivePreset = repo?.protection;

	print(`Holocron setup — ${config.project.name}${dryRun ? " (dry-run)" : ""}`);
	print(`  config: ${input.loaded.filepath}`);
	print("");

	// ── source: security toggles + repo policy ──────────────────────────
	if (loader.has("source")) {
		const source = loader.get("source") as Source;
		print("  → source");
		for (const method of [
			"enableVulnerabilityAlerts",
			"enableAutomatedSecurityFixes",
			"enableSecretScanning",
			"enablePrivateVulnerabilityReporting",
			"enableDependencyGraph",
		] as const) {
			steps.push(
				await runStep("source", method, dryRun, async () => {
					await source[method]();
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}

		const usesAdvancedCodeQL = (config.project.workflows ?? [])
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

			const configuredWorkflowNames = (config.project.workflows ?? []).map((entry) =>
				typeof entry === "string" ? entry : entry.name
			);
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
	const workflows = config.project.workflows;
	if (loader.has("source") && workflows && workflows.length > 0) {
		const source = loader.get("source") as Source;
		print("  → workflows");
		for (const entry of workflows) {
			const name = typeof entry === "string" ? entry : entry.name;
			const withOverrides = typeof entry === "object" ? entry.with : undefined;
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
			steps.push(
				await runStep("source", `write workflow ${name}`, dryRun, async () => {
					await source.writeWorkflowFile(
						`${name}.yml`,
						workflowHeader() + generateThinCallerContent(name, withOverrides)
					);
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── source: labeler config ───────────────────────────────────────────
	if (
		loader.has("source") &&
		(config.project.workflows ?? []).map((e) => (typeof e === "string" ? e : e.name)).includes("bookkeeping-pr")
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
				await source.writeRepoFile(".github/dependabot.yml", DEPENDABOT_CONFIG);
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
	}

	// ── environments ────────────────────────────────────────────────────
	if (loader.has("environments")) {
		const envs = loader.get("environments") as Environments;
		print("  → environments");
		for (const envName of ["staging", "production"]) {
			steps.push(
				await runStep("environments", `upsert ${envName}`, dryRun, async () => {
					await envs.upsertEnvironment({ name: envName });
				})
			);
			print(formatStep(steps[steps.length - 1]!));
		}
	}

	// ── deployment: ensure project ──────────────────────────────────────
	if (loader.has("deployment")) {
		const deploy = loader.get("deployment") as Deployment;
		print("  → deployment");
		steps.push(
			await runStep("deployment", `ensureProject ${config.project.name}`, dryRun, async () => {
				await deploy.ensureProject({ name: config.project.name });
			})
		);
		print(formatStep(steps[steps.length - 1]!));
	}

	// ── auth: ensure webhook app (optional method) ──────────────────────
	if (loader.has("auth")) {
		const auth = loader.get("auth") as Auth;
		print("  → auth");
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
		print("  → vault");

		// ensureProject — providers that have a top-level container.
		if (vault.ensureProject) {
			steps.push(
				await runStep("vault", `ensureProject ${config.project.name}`, dryRun, async () => {
					const result = await vault.ensureProject!(config.project.name);
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
						const result = await vault.ensureEnvironment!(config.project.name, envName);
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
		print("  → tooling");
		for (const tool of tools) {
			steps.push(
				await runStep("tooling", `${tool.providerName}.sync`, dryRun, async () => {
					await tool.sync();
				})
			);
			print(formatStep(steps[steps.length - 1]!));
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

// ── helpers ──────────────────────────────────────────────────────────

async function runStep(
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

function formatStep(step: SetupStepResult): string {
	const icon = step.status === "ok" ? "✓" : step.status === "fail" ? "✗" : step.status === "dry-run" ? "…" : "·";
	const detail = step.message ? `  (${step.message})` : "";
	return `    ${icon} ${step.step}${detail}`;
}
