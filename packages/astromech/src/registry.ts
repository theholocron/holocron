/**
 * The task registry — how each task runs *locally*, without GitHub
 * Actions. `holocron run <task>` and `holocron ci` resolve against this;
 * adding a task here gives every repo that task.
 *
 * Keyed identically to the workflow templates — a task IS a workflow. This
 * is the canonical vocabulary table (epic #672, D11): every other artifact
 * (`KNOWN_TASKS`, `thin-callers.ts`'s `KNOWN_WORKFLOWS`/`WORKFLOW_CHECK_CONTEXTS`,
 * `CI_ORDER`) derives from these keys rather than hand-duplicating them —
 * including the future GitHub App (#679), which imports this same table for
 * config-schema validation instead of reimplementing its own copy.
 *
 * Task names are an intent-facing vocabulary (`verification.*`,
 * `sourceQuality.*`, `security.*`, `delivery.*`, `platform.*`,
 * `knowledge.*`), not tool names — `eslint`/`vitest`/`tsdown`/… stay
 * internal to this file and `theholocron/configs`. See
 * `.notes/tech-vocabulary-rename.spec.md` (#675) for the full mapping and
 * the reasoning behind each namespace and decomposition.
 *
 * Spec: `docs/wiki/specifications/tech-astromech-task-runner.spec.md` (epic #581).
 */

/** How to run one task (or job) locally. */
export interface LocalRunner {
	/** Binary to invoke — resolved from `node_modules/.bin` then PATH. */
	tool?: string;
	/** Args appended after the tool. */
	args?: string[];
	/** First entry whose `when` filename matches a repo-root file wins. */
	detect?: Array<{ when: RegExp; tool: string; args?: string[] }>;
	/** The task is already a holocron subcommand (`sync`, `sync-wiki`). */
	command?: string;
}

/** One sub-job of a task — `performance` in `holocron run audit performance`. */
export interface JobDef {
	/** How the job runs locally; `null` → no local equivalent (enforced in CI). */
	local: LocalRunner | null;
	/**
	 * The CI status-check context this job reports as (e.g.
	 * `platform.repoValidation / Validate registry consistency`) — every sub-job is a CI job.
	 * `holocron run <task>` and `holocron ci` label each job line with it;
	 * the task-level `… / Conclusion` context (only for tasks with several
	 * jobs) lives in `WORKFLOW_CHECK_CONTEXTS`.
	 */
	checkContext: string;
}

export interface TaskDef {
	/**
	 * `null` — the registry has no built-in runner (CodeQL, deploys, the
	 * bundle-size job). An explicit turbo task or `package.json` script still
	 * runs (resolution steps 1–2); with neither, `holocron run` does nothing
	 * and `holocron ci` skips it — never a failure, even when the task is
	 * `required` (a CI-only check isn't a local one).
	 */
	local: LocalRunner | null;
	/**
	 * Sub-jobs, keyed by slug. Declared order is run order: `holocron run
	 * <task>` (no job) runs each in turn.
	 */
	jobs?: Record<string, JobDef>;
	/** Org-default flags injected by tool name. Removed by a repo override. */
	flags?: Record<string, string[]>;
	/**
	 * This task is a linter-group aggregate: `holocron run <task>` resolves
	 * this fixed set of `linters.ts` entries (still gated by each linter's
	 * own `detect`/`always` rule) and runs each natively, instead of using
	 * `local`. Replaces the old single `lint` task's auto-detected linter
	 * list (`config.tasks[].linters`) — a repo's choice of which of these
	 * run is now just whether it includes this task in `tasks: [...]`, same
	 * as any other task. See `linters.ts` / `run.ts`.
	 */
	linterGroup?: string[];
	/** Carries a `preview` mode (Cloudflare/Vercel deploy, npm dist-tag, Fern preview docs, …). Cross-cutting, not its own task. */
	preview?: boolean;
}

export const TASKS: Record<string, TaskDef> = {
	// ── verification.* — does the code work? ──────────────────────────────
	"verification.unitTests": {
		local: { tool: "vitest", args: ["run"] },
		flags: { vitest: ["--coverage"] },
	},
	"verification.typeSafety": {
		local: { tool: "tsc", args: ["--noEmit"] },
	},
	"verification.performance": {
		local: {
			detect: [
				{ when: /^lighthouse\.config\.(cjs|js|mjs|ts)$/, tool: "lhci", args: ["autorun"] },
				{ when: /^lighthouserc\.(cjs|js|mjs|json|yml|yaml)$/, tool: "lhci", args: ["autorun"] },
			],
		},
	},

	// ── sourceQuality.* — is the source well-formed? ──────────────────────
	"sourceQuality.staticAnalysis": {
		local: null,
		linterGroup: ["eslint", "actionlint", "git-merge-conflict-markers"],
	},
	"sourceQuality.formatting": {
		local: null,
		linterGroup: ["prettier", "editorconfig", "markdownlint"],
	},
	"sourceQuality.structuredDataValidation": {
		local: null,
		linterGroup: ["yamllint"],
	},
	"sourceQuality.deadCodeAnalysis": {
		local: { tool: "knip" },
	},

	// ── security.* ─────────────────────────────────────────────────────────
	"security.secretDetection": {
		local: null,
		linterGroup: ["gitleaks"],
	},
	"security.codeScanning": { local: null },

	// ── delivery.* — shipping software (npm packages, deployed apps) ──────
	"delivery.build": {
		local: {
			detect: [
				{ when: /^tsdown\.config\.(ts|js|mjs|cjs)$/, tool: "tsdown" },
				{ when: /^vite\.config\.(ts|js|mjs|cjs)$/, tool: "vite", args: ["build"] },
				{ when: /^rollup\.config\.(ts|js|mjs|cjs)$/, tool: "rollup", args: ["-c"] },
				{ when: /^tsconfig\.json$/, tool: "tsc", args: ["-b"] },
			],
		},
	},
	"delivery.publish": { local: null, preview: true },
	"delivery.deploy": { local: null, preview: true },
	"delivery.bundleSize": { local: null },

	// ── platform.* — operating the repo itself ────────────────────────────
	"platform.repoSync": { local: { command: "sync" } },
	"platform.commitStandards": {
		local: null,
		linterGroup: ["commitlint"],
	},
	// Process/governance checks that rode inside the old monolithic `lint`
	// task with no linter connection at all — spec/ADR frontmatter, registry
	// completeness. Not `linters.ts` entries (not linters), so plain jobs.
	"platform.repoValidation": {
		local: null,
		jobs: {
			adrs: {
				local: { tool: "node", args: ["scripts/validate-adrs.mjs"] },
				checkContext: "platform.repoValidation / Validate ADRs and specs",
			},
			registry: {
				local: { tool: "node", args: ["scripts/validate-registry.mjs"] },
				checkContext: "platform.repoValidation / Validate registry consistency",
			},
			// Warns (never fails — the script itself always exits 0) when a PR
			// adds a new public package without a docs change. Doesn't actually
			// require a docs *site* to be meaningful (just "was something
			// documented"), so it belongs here with its process/governance
			// siblings, not gated behind knowledge.docs.
			docsPresence: {
				local: { tool: "node", args: ["scripts/validate-docs-presence.mjs"] },
				checkContext: "platform.repoValidation / Validate docs presence",
			},
		},
	},

	// ── knowledge.* — published content, not software ─────────────────────
	"knowledge.wiki": { local: { command: "sync-wiki" }, preview: true },
	"knowledge.docs": { local: null, preview: true },
	"knowledge.components": { local: null, preview: true },
};

/** Every task name the registry knows. */
export const KNOWN_TASKS = new Set(Object.keys(TASKS));

/**
 * The order `holocron ci` runs tasks in — cheapest / fastest signal first, so
 * an agent or a `pre-push` hook fails early. Tasks not listed here run last, in
 * manifest order. (The generated thin callers carry no `needs:` — cross-workflow
 * ordering lives in `theholocron/.github` — so `holocron ci` declares its own.)
 */
export const CI_ORDER: string[] = [
	"verification.typeSafety",
	"sourceQuality.staticAnalysis",
	"sourceQuality.formatting",
	"sourceQuality.structuredDataValidation",
	"security.secretDetection",
	"platform.commitStandards",
	"platform.repoValidation",
	"verification.unitTests",
	"delivery.build",
	"sourceQuality.deadCodeAnalysis",
	"delivery.bundleSize",
	"verification.performance",
	"security.codeScanning",
	"delivery.deploy",
];
