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

/**
 * How a task fans out across every workspace via Turborepo — content-hash
 * caching + `^`-prefixed cross-package ordering, epic #672 D9 (#681).
 * Present only on tasks that genuinely run *per workspace* (a real build/
 * compile/test step); whole-repo single-run tools (prettier, gitleaks,
 * commitlint, yamllint, …) have no entry here — they stay off turbo.json
 * entirely and run once, un-fanned-out, the way they already do.
 */
export interface TurboTaskConfig {
	/** Glob patterns turbo hashes to decide whether a cached run is still valid. */
	inputs: string[];
	/** Glob patterns turbo caches/restores after a run. Empty array for a task with no build artifact (lint, typecheck). */
	outputs: string[];
	/** Task names this depends on — a bare name runs in this package first; `^name` waits on every upstream workspace's task. */
	dependsOn: string[];
}

/** One sub-job of a task — `performance` in `holocron run audit performance`. */
export interface JobDef {
	/** How the job runs locally; `null` → no local equivalent (enforced in CI). */
	local: LocalRunner | null;
	/**
	 * The CI status-check context this job reports as (e.g.
	 * `platform.repoValidation / Validate docs presence`) — every sub-job is a CI job.
	 * `holocron run <task>` and `holocron run ci` label each job line with it;
	 * the task-level `… / Conclusion` context (only for tasks with several
	 * jobs) lives in `WORKFLOW_CHECK_CONTEXTS`.
	 */
	checkContext: string;
	/**
	 * The name a repo's config uses to switch this job off (`jobs: { docsEnforcement: false }`),
	 * where the job's own key is vague or fixed by the reusable workflow. The key itself works too.
	 */
	alias?: string;
}

export interface TaskDef {
	/**
	 * Sub-job slugs that no longer exist but that a reusable workflow synced earlier may still pass:
	 * `holocron run <task> <retired>` is a clean skip instead of an unknown-job failure.
	 */
	retiredJobs?: string[];
	/**
	 * `null` — the registry has no built-in runner (CodeQL, deploys, the
	 * bundle-size job). An explicit turbo task or `package.json` script still
	 * runs (resolution steps 1–2); with neither, `holocron run` does nothing
	 * and `holocron run ci` skips it — never a failure, even when the task is
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
	/** Turborepo fan-out config for this task — see {@link TurboTaskConfig}. Omitted for whole-repo, non-fan-out tasks. */
	turbo?: TurboTaskConfig;
}
