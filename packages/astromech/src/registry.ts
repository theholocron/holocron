/**
 * The task registry — how each task runs *locally*, without GitHub
 * Actions. `holocron run <task>` and `holocron ci` resolve against this;
 * adding a task here gives every repo that task.
 *
 * Keyed identically to the workflow templates — a task IS a workflow.
 *
 * Spec: `.notes/tech-astromech-task-runner.spec.md` (epic #581).
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
	 * The CI status-check context this job reports as (`audit / Knip`) — every
	 * sub-job is a CI job. `holocron run audit` and `holocron ci` label each job
	 * line with it; the task-level `… / Conclusion` context lives in
	 * `WORKFLOW_CHECK_CONTEXTS`.
	 */
	checkContext: string;
}

export interface TaskDef {
	/**
	 * `null` — the registry has no built-in runner (CodeQL, deploys, audit's
	 * server / baseline jobs). An explicit turbo task or `package.json` script
	 * still runs (resolution steps 1–2); with neither, `holocron run` does
	 * nothing and `holocron ci` skips it — never a failure, even when the task
	 * is `required` (a CI-only check isn't a local one).
	 */
	local: LocalRunner | null;
	/**
	 * Sub-jobs, keyed by slug — `holocron run audit performance`. Declared order
	 * is run order: `holocron run audit` (no job) runs each in turn.
	 */
	jobs?: Record<string, JobDef>;
	/** Org-default flags injected by tool name. Removed by a repo override. */
	flags?: Record<string, string[]>;
	/**
	 * This task is the linter aggregate: `holocron run lint` resolves the
	 * linter set (`config.tasks` `linters` or auto-detect) and runs each
	 * natively instead of using `local`. See `linters.ts` / `super-linter.ts`.
	 */
	linters?: boolean;
}

export const TASKS: Record<string, TaskDef> = {
	test: {
		local: { tool: "vitest", args: ["run"] },
		flags: { vitest: ["--coverage"] },
	},
	typecheck: {
		local: { tool: "tsc", args: ["--noEmit"] },
	},
	lint: {
		local: { tool: "eslint", args: ["."] },
		linters: true,
	},
	build: {
		local: {
			detect: [
				{ when: /^tsdown\.config\.(ts|js|mjs|cjs)$/, tool: "tsdown" },
				{ when: /^vite\.config\.(ts|js|mjs|cjs)$/, tool: "vite", args: ["build"] },
				{ when: /^rollup\.config\.(ts|js|mjs|cjs)$/, tool: "rollup", args: ["-c"] },
				{ when: /^tsconfig\.json$/, tool: "tsc", args: ["-b"] },
			],
		},
	},

	// Tasks that ARE holocron subcommands — `holocron run sync` → `holocron sync`.
	sync: { local: { command: "sync" } },
	wiki: { local: { command: "sync-wiki" } },

	// No built-in top-level runner. `holocron run audit` / `holocron ci` still
	// honour an explicit turbo task or `package.json` script (e.g. `"audit":
	// "knip"`); with neither, `holocron run audit` runs each sub-job in declared
	// order — `bundle-size` (CI-only), `knip`, `performance`.
	audit: {
		local: null,
		jobs: {
			// Build + upload bundle stats to Codecov — no meaningful local equivalent.
			"bundle-size": { local: null, checkContext: "audit / Audit the bundle size" },
			// Dead-code / unused-dependency analysis.
			knip: { local: { tool: "knip" }, checkContext: "audit / Knip" },
			// Lighthouse CI — only runnable with a lighthouse config in the repo root.
			performance: {
				local: {
					detect: [
						{ when: /^lighthouse\.config\.(cjs|js|mjs|ts)$/, tool: "lhci", args: ["autorun"] },
						{ when: /^lighthouserc\.(cjs|js|mjs|json|yml|yaml)$/, tool: "lhci", args: ["autorun"] },
					],
				},
				checkContext: "audit / Audit the performance",
			},
		},
	},
	codeql: { local: null },
	deploy: { local: null },
};

/** Every task name the registry knows. */
export const KNOWN_TASKS = new Set(Object.keys(TASKS));

/**
 * The order `holocron ci` runs tasks in — cheapest / fastest signal first, so
 * an agent or a `pre-push` hook fails early. Tasks not listed here run last, in
 * manifest order. (The generated thin callers carry no `needs:` — cross-workflow
 * ordering lives in `theholocron/.github` — so `holocron ci` declares its own.)
 */
export const CI_ORDER: string[] = ["typecheck", "lint", "test", "build", "audit", "codeql", "deploy"];
