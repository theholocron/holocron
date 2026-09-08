/**
 * The task registry — how each `config.workflows` entry runs *locally*,
 * without GitHub Actions. `holocron run <task>` and `holocron ci` resolve
 * against this; adding a task here gives every repo that task.
 *
 * Keyed identically to `WORKFLOW_TEMPLATES` in
 * `commands/setup-workflows/index.ts` — a task IS a workflow.
 *
 * Spec: `.notes/tech-astromech-task-runner.spec.md` (epic #581).
 * Phase 1 — this lives in `packages/cli` for now; it moves into
 * `@theholocron/astromech` at Phase 2b (#583).
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

export interface TaskDef {
	/**
	 * `null` — no local equivalent (CodeQL, deploys). `holocron ci` reports
	 * it as skipped; `holocron run` treats it as "nothing to do".
	 */
	local: LocalRunner | null;
	/** Sub-jobs, keyed by slug — `holocron run audit performance`. */
	jobs?: Record<string, { local: LocalRunner | null }>;
	/** Org-default flags injected by tool name. Removed by a repo override. */
	flags?: Record<string, string[]>;
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

	// No local equivalent — `holocron ci` reports these as skipped.
	codeql: { local: null },
	deploy: { local: null },
};

/** Every task name the registry knows — the `config.workflows` names too. */
export const KNOWN_TASKS = new Set(Object.keys(TASKS));
