import type { TaskDef } from "./registry.type.js";
/**
 * The task registry — how each task runs *locally*, without GitHub
 * Actions. `holocron run <task>` and `holocron run ci` resolve against this;
 * adding a task here gives every repo that task.
 *
 * Keyed by the flat, verb-first id (`test:unit`, `lint:code`, `build`,
 * `deploy-preview`), the one spelling of a task in the CLI (spec
 * `ci-flat-task-vocabulary`, SPEC-0064, epic #1612). A colon means "member of
 * the suite named before it": `test`, `lint`, `scan` and
 * `validate` are suites, declared here by the `suite` field of their leaves
 * and never ids of their own. A hyphen is part of a verb phrase and implies no
 * suite. The old dotted names (`verification.unitTests`, …) are accepted for a
 * window through {@link LEGACY_NAMES} and still name the generated workflow
 * files, turbo tasks and `package.json` scripts until the later phases move
 * those (see {@link legacyName}).
 *
 * Every other artifact (`KNOWN_TASKS`, `CI_ORDER`, the suites) derives from
 * these keys rather than hand-duplicating them — including the GitHub App
 * (#679), which imports this same table for config-schema validation.
 *
 * Declared order is run order: a suite runs its members in the order they
 * appear here.
 *
 * Task names are an intent-facing vocabulary, not tool names —
 * `eslint`/`vitest`/`tsdown`/… stay internal to this file and the `configs/`
 * folder.
 *
 * Spec: `.notes/ci-flat-task-vocabulary.spec.md`, and
 * `docs/wiki/specifications/tech-astromech-task-runner.spec.md` (epic #581).
 */

export const TASKS: Record<string, TaskDef> = {
	// ── Verification — does the code work? ────────────────────────────────
	"test:unit": {
		group: "Verification",
		scope: "package",
		suite: "test",
		// Unit tests always run with coverage: it is in the command, not a flag anyone passes (spec decision 10).
		local: { tool: "vitest", args: ["run", "--coverage"] },
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
			dependsOn: ["build", "^build"],
		},
	},
	// Its own task/workflow, not a `test:unit` sub-job
	// (holocron#394/#1062) -- GitHub evaluates a job's `if:` before
	// expanding its `strategy.matrix`, so no `chromatic-projects` default
	// can make a *disabled* Chromatic job disappear from PR checks; only
	// not generating the job at all does. A repo opts in by listing this
	// task, same as any other optional task -- omitting it means no
	// workflow, no job, no check, not even a skipped one.
	"test:visual": { group: "Verification", scope: "repo", suite: "test", local: null },
	"test:perf": {
		group: "Verification",
		scope: "repo",
		suite: "test",
		local: {
			detect: [
				{ when: /^lighthouse\.config\.(cjs|js|mjs|ts)$/, tool: "lhci", args: ["autorun"] },
				{ when: /^lighthouserc\.(cjs|js|mjs|json|yml|yaml)$/, tool: "lhci", args: ["autorun"] },
			],
		},
	},
	// Its own verb, not `test:types`: it needs no test runner, runs on a different input set and posts a separate check.
	typecheck: {
		group: "Verification",
		scope: "package",
		local: { tool: "tsc", args: ["--noEmit"] },
		turbo: {
			inputs: ["src/**", "test/**", "tsconfig.json"],
			outputs: [],
			dependsOn: ["^build"],
		},
	},

	// ── Source Quality — is the source well-formed? ───────────────────────
	"lint:code": {
		group: "Source Quality",
		scope: "package",
		suite: "lint",
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
			dependsOn: ["^build"],
		},
	},
	"lint:editorconfig": {
		group: "Source Quality",
		scope: "repo",
		suite: "lint",
		local: null,
		linterGroup: ["editorconfig"],
	},
	"lint:markdown": {
		group: "Source Quality",
		scope: "repo",
		suite: "lint",
		local: null,
		linterGroup: ["markdownlint"],
	},
	"lint:data": {
		group: "Source Quality",
		scope: "repo",
		suite: "lint",
		local: null,
		linterGroup: ["yamllint"],
	},
	// knip reports unused files, exports and dependencies, hence `unused` and not "dead code".
	"lint:unused": { group: "Source Quality", scope: "repo", suite: "lint", local: { tool: "knip" } },
	// commitlint has no local runner (the `commit-msg` hook covers it), so a run skips it as CI-only.
	"lint:commits": {
		group: "Source Quality",
		scope: "repo",
		suite: "lint",
		local: null,
		linterGroup: ["commitlint"],
	},
	// Not a suite and not a linter: the one task that writes by default (`--check` is the read-only form). It has no
	// workflow of its own; its check is the `ci/actions/format` action, which the `lint:code` workflow calls.
	format: {
		group: "Source Quality",
		scope: "repo",
		workflow: false,
		host: "lint:code",
		local: { tool: "prettier", args: ["--write", "."] },
		checkArgs: ["--check", "."],
	},

	// ── Security ───────────────────────────────────────────────────────────
	"scan:secrets": {
		group: "Security",
		scope: "repo",
		suite: "scan",
		local: null,
		linterGroup: ["gitleaks"],
	},
	"scan:code": { group: "Security", scope: "repo", suite: "scan", local: null },
	// Runs `holocron doctor tokens`: fails on a token that is rejected or has 7 days or fewer left. Scheduled daily by
	// its workflow; never part of `holocron run ci`'s gate (it needs the org's token secrets, and a token about to
	// expire is not a reason to block a merge). Not a `scan` leaf: it is an operations signal that needs secrets.
	"check-tokens": { group: "Security", scope: "repo", local: { command: "doctor tokens" } },

	// ── Delivery — shipping software (npm packages, deployed apps) ────────
	build: {
		group: "Delivery",
		scope: "package",
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
			dependsOn: ["^build"],
		},
	},
	// Renamed from `publish`, which npm and pnpm give a meaning of their own (see `RESERVED_SCRIPT_NAMES`).
	release: { group: "Delivery", scope: "repo", local: null, preview: true },
	deploy: { group: "Delivery", scope: "package", local: null, preview: true },
	"measure-bundle": { group: "Delivery", scope: "repo", local: null },
	// No local runner — needs a live preview deployment URL that only
	// exists once Vercel has actually deployed it (holocron#1010). Never
	// part of `holocron run ci`'s push/PR gate; runs only from its own
	// `deployment_status`-triggered workflow.
	"check-preview": { group: "Delivery", scope: "repo", local: null },
	// No generic local runner — each consuming package defines its own
	// build-stage-deploy script under this exact task name, same shape as
	// `deploy`; the reusable workflow just runs it via `holocron run
	// deploy-preview`. Triggered by `pull_request` and reports a synthetic
	// deployment_status with the resulting URL (holocron#1010 follow-up, #1016,
	// #1017's review) — Vercel's own GitHub integration never sees a
	// file-uploaded (deployFunction) deploy, so there is nothing to synthesize
	// this from on Vercel's side.
	"deploy-preview": { group: "Delivery", scope: "package", local: null },

	// ── Platform — operating the repo itself ──────────────────────────────
	// Process/governance checks that rode inside the old monolithic `lint` task with no linter connection at all.
	// Not `linters.ts` entries (not linters), so plain tasks of the `validate` suite, each a holocron subcommand.
	// Spec/ADR frontmatter (`holocron probe specs check`).
	"validate:specs": { group: "Platform", scope: "repo", suite: "validate", local: { command: "probe specs check" } },
	// Warns (never fails -- `holocron probe docs presence` reports, it does not exit non-zero) when a PR adds a new
	// public package, or a `feat` changes one, without a docs change. It does not need a docs *site* to be meaningful
	// (just "was something documented"), so it belongs here with its process/governance sibling, not behind the docs
	// deploy. The doc-comment gate (`docs patch`, `repoValidation.docsCoverage`) is its own workflow, not this task.
	"validate:docs": { group: "Platform", scope: "repo", suite: "validate", local: { command: "probe docs presence" } },
	// A plugin package's live check against its provider (its own `scripts/validate.mjs`, run by hand with the provider's
	// credentials): the package's script is the whole task, so there is no built-in runner and no workflow, and it is not
	// part of `holocron run ci`. It is a leaf so that the 16 plugins' script has a name in the suite and no collision.
	"validate:plugin": { group: "Platform", scope: "package", suite: "validate", workflow: false, local: null },
	"sync-repo": { group: "Platform", scope: "repo", local: { command: "sync" } },
	// No local runner -- it posts real messages through org secrets that only a
	// workflow can read. Manual (workflow_dispatch) only: the end-to-end check for
	// `holocron notifications setup`, never part of `holocron run ci`.
	"check-notify": { group: "Platform", scope: "repo", local: null },
	// No local equivalent runner distinct from `sync github` itself —
	// invokes the CLI subcommand directly, same shape as sync-repo's `sync`.
	// Holocron-repo-specific: pushes astromech's own generated reusable
	// workflows/composite actions to theholocron/.github, so only this
	// repo's thin caller is ever meaningfully triggered (holocron#1013).
	"sync-templates": { group: "Platform", scope: "repo", local: { command: "sync github" } },
	// Runs `holocron project reconcile`: sets each item's status on the declared project boards from its issue state and
	// its "blocked by" links (spec `command-project`, #1744), then its workflow runs `doctor project` for what is left.
	// Scheduled hourly by its workflow; never part of `holocron run ci` (it writes to a live board with a GitHub App token).
	"reconcile-projects": { group: "Platform", scope: "repo", local: { command: "project reconcile" } },

	// ── Knowledge — published content, not software ───────────────────────
	"publish-wiki": { group: "Knowledge", scope: "repo", local: { command: "sync-wiki" }, preview: true },
	"deploy-docs": { group: "Knowledge", scope: "repo", local: null, preview: true },
	"deploy-components": { group: "Knowledge", scope: "repo", local: null, preview: true },
};

/**
 * The order `holocron run ci` runs tasks in — cheapest / fastest signal first, so
 * an agent or a `pre-push` hook fails early. Tasks not listed here run last, in
 * manifest order. (The generated thin callers carry no `needs:` — cross-workflow
 * ordering lives in `theholocron/.github` — so `holocron run ci` declares its own.)
 */
export const CI_ORDER: string[] = [
	"typecheck",
	"lint:code",
	"lint:editorconfig",
	"lint:markdown",
	"format",
	"lint:data",
	"scan:secrets",
	"lint:commits",
	"validate:specs",
	"validate:docs",
	"test:unit",
	"build",
	"lint:unused",
	"measure-bundle",
	"test:perf",
	"scan:code",
	"deploy",
];
