import type { TaskDef } from "./registry.type.js";
/**
 * The task registry — how each task runs *locally*, without GitHub
 * Actions. `holocron run <task>` and `holocron run ci` resolve against this;
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
 * internal to this file and the `configs/` folder. See
 * `docs/wiki/specifications/tech-vocabulary-rename.spec.md` (#675) for the full mapping and
 * the reasoning behind each namespace and decomposition.
 *
 * Spec: `docs/wiki/specifications/tech-astromech-task-runner.spec.md` (epic #581).
 */

export const TASKS: Record<string, TaskDef> = {
	// ── verification.* — does the code work? ──────────────────────────────
	"verification.unitTests": {
		local: { tool: "vitest", args: ["run"] },
		flags: { vitest: ["--coverage"] },
		turbo: {
			inputs: [
				"src/**",
				"test/**",
				"vitest.config.ts",
				"vitest.config.js",
				"vitest.config.mjs",
				// A repo-root vitest config shared by every package without its own.
				"$TURBO_ROOT$/vitest.config.ts",
				"$TURBO_ROOT$/vitest.config.js",
				"$TURBO_ROOT$/vitest.config.mjs",
				"package.json",
			],
			outputs: ["test-report.junit.xml", "coverage/**"],
			// Own package's build first (tests may import from dist) + every
			// upstream workspace's build (so a dependency's types/dist are current).
			dependsOn: ["delivery.build", "^delivery.build"],
		},
	},
	"verification.typeSafety": {
		local: { tool: "tsc", args: ["--noEmit"] },
		turbo: {
			inputs: ["src/**", "test/**", "tsconfig.json"],
			outputs: [],
			dependsOn: ["^delivery.build"],
		},
	},
	// Its own task/workflow, not a `verification.unitTests` sub-job
	// (holocron#394/#1062) -- GitHub evaluates a job's `if:` before
	// expanding its `strategy.matrix`, so no `chromatic-projects` default
	// can make a *disabled* Chromatic job disappear from PR checks; only
	// not generating the job at all does. A repo opts in by listing this
	// task, same as any other optional task -- omitting it means no
	// workflow, no job, no check, not even a skipped one.
	"verification.visualRegression": { local: null },
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
		turbo: {
			// ESLint finds a config by walking up from the package, so a package with none of its own
			// lints with the repo root's: that file is an input too, or editing it would serve stale
			// cached results for every such package.
			inputs: [
				"src/**",
				"eslint.config.ts",
				"eslint.config.js",
				"eslint.config.mjs",
				"eslint.config.cjs",
				"$TURBO_ROOT$/eslint.config.ts",
				"$TURBO_ROOT$/eslint.config.js",
				"$TURBO_ROOT$/eslint.config.mjs",
				"$TURBO_ROOT$/eslint.config.cjs",
			],
			outputs: [],
			dependsOn: ["^delivery.build"],
		},
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
	// Runs `holocron doctor tokens`: fails on a token that is rejected or has 7 days or fewer left. Scheduled daily by
	// its workflow; never part of `holocron run ci`'s gate (it needs the org's token secrets, and a token about to
	// expire is not a reason to block a merge).
	"security.tokenExpiry": { local: { command: "doctor tokens" } },

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
		turbo: {
			// Covers every `local.detect` build tool above — turbo doesn't mind
			// listing a config filename a given package doesn't have.
			inputs: [
				"src/**",
				"package.json",
				"tsdown.config.ts",
				// A repo-root tsdown config shared by every package without its own.
				"$TURBO_ROOT$/tsdown.config.ts",
				"vite.config.ts",
				"rollup.config.ts",
				"tsconfig.json",
			],
			outputs: ["dist/**"],
			// Depends only on upstream workspaces — a package can't depend on
			// its own not-yet-built output.
			dependsOn: ["^delivery.build"],
		},
	},
	"delivery.publish": { local: null, preview: true },
	"delivery.deploy": { local: null, preview: true },
	"delivery.bundleSize": { local: null },
	// No local runner — needs a live preview deployment URL that only
	// exists once Vercel has actually deployed it (holocron#1010). Never
	// part of `holocron run ci`'s push/PR gate; runs only from its own
	// `deployment_status`-triggered workflow.
	"delivery.previewCheck": { local: null },
	// No generic local runner — each consuming package defines its own
	// build-stage-deploy script under this exact task name, same shape as
	// `delivery.deploy`; the reusable workflow just runs it via `holocron
	// run delivery.previewDeploy`. Triggered by `pull_request` and reports
	// a synthetic deployment_status with the resulting URL (holocron#1010
	// follow-up, #1016, #1017's review) — Vercel's own GitHub integration
	// never sees a file-uploaded (deployFunction) deploy, so there is
	// nothing to synthesize this from on Vercel's side.
	"delivery.previewDeploy": { local: null },

	// ── platform.* — operating the repo itself ────────────────────────────
	"platform.repoSync": { local: { command: "sync" } },
	// No local runner -- it posts real messages through org secrets that only a
	// workflow can read. Manual (workflow_dispatch) only: the end-to-end check for
	// `holocron notifications setup`, never part of `holocron run ci`.
	"platform.notifyCheck": { local: null },
	// No local equivalent runner distinct from `sync github` itself —
	// invokes the CLI subcommand directly, same shape as repoSync's `sync`.
	// Holocron-repo-specific: pushes astromech's own generated reusable
	// workflows/composite actions to theholocron/.github, so only this
	// repo's thin caller is ever meaningfully triggered (holocron#1013).
	"platform.syncTemplates": { local: { command: "sync github" } },
	"platform.commitStandards": {
		local: null,
		linterGroup: ["commitlint"],
	},
	// Process/governance checks that rode inside the old monolithic `lint`
	// task with no linter connection at all — spec/ADR frontmatter, docs
	// presence. Not `linters.ts` entries (not linters), so plain jobs.
	"platform.repoValidation": {
		local: null,
		// The package-registry check is gone, but the reusable workflow in theholocron/.github keeps a
		// `registry` job until it is re-synced; it must skip, not fail, meanwhile.
		retiredJobs: ["registry"],
		jobs: {
			adrs: {
				local: { command: "probe specs check" },
				checkContext: "platform.repoValidation / Validate ADRs and specs",
			},
			// Warns (never fails — `holocron probe docs presence` reports, it does not
			// exit non-zero) when a PR adds a new public package, or a `feat` changes
			// one, without a docs change. Doesn't actually require a docs *site* to be
			// meaningful (just "was something documented"), so it belongs here with its
			// process/governance siblings, not gated behind knowledge.docs.
			docsPresence: {
				local: { command: "probe docs presence" },
				checkContext: "platform.repoValidation / Validate docs presence",
				alias: "docsEnforcement",
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
 * The order `holocron run ci` runs tasks in — cheapest / fastest signal first, so
 * an agent or a `pre-push` hook fails early. Tasks not listed here run last, in
 * manifest order. (The generated thin callers carry no `needs:` — cross-workflow
 * ordering lives in `theholocron/.github` — so `holocron run ci` declares its own.)
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
