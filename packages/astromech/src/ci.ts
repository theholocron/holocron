/**
 * `holocron ci` / `astromech.ci()` — run the merge-gating checks locally, in CI
 * order, and exit non-zero on the first failure. The "will CI pass?" command a
 * `pre-push` hook and the agent skills point at.
 *
 * Default scope: every `required: true` task. If the manifest marks nothing
 * required (an un-migrated repo), fall back to every `ci: true` task. `--all`
 * forces the full set. Each task runs through {@link runTask}: a `required`
 * task whose local runner can't run is a failure; a `local: null` task with
 * no turbo task / `package.json` script is skipped, never failed — even when
 * `required` (it's a CI-only check, not a local one).
 */

import { normalizeTaskEntry, type TaskEntry, type TasksConfig } from "./config/schema.js";
import { CI_ORDER } from "./registry.js";
import { type RunDeps, runTask } from "./run.js";
import { WORKFLOW_CHECK_CONTEXTS } from "./thin-callers.js";

export interface CiOptions {
	/** Print the plan without running anything. */
	dryRun?: boolean;
	/** `turbo --filter=<pkg>` passthrough (monorepo). */
	filter?: string;
	/** `"required"` (default) or `"all"` (every `ci: true` task). */
	scope?: "required" | "all";
}

export interface CiJobReport {
	task: string;
	/** The branch-protection check context, or `null` for a non-gating task. */
	checkContext: string | null;
	status: "ok" | "fail" | "skip" | "dry-run";
	command?: string;
	message?: string;
}

export interface CiReport {
	status: "ok" | "fail";
	jobs: CiJobReport[];
}

export interface CiInput extends RunDeps, CiOptions {
	cwd: string;
	config: TasksConfig;
	/** Explicit linter list for the `lint` task (the config's lint entry `linters`). */
	linters?: string[];
}

export function runCi(input: CiInput): CiReport {
	const { print } = input;

	// de-dup task entries by name (last wins); keep only the merge-gating tasks
	// (`CI_ORDER` — excludes `sync` / `wiki`, which aren't checks).
	const byName = new Map<string, ReturnType<typeof normalizeTaskEntry>>();
	for (const item of input.config?.tasks ?? []) byName.set(taskName(item), normalizeTaskEntry(item));
	const gating = [...byName.values()].filter((e) => CI_ORDER.includes(e.name));

	const all = gating.filter((e) => e.ci !== false);
	const required = gating.filter((e) => e.required === true);

	let selected = input.scope === "all" ? all : required;
	const fellBack = input.scope !== "all" && selected.length === 0 && all.length > 0;
	if (fellBack) selected = all;

	const ordered = [...selected].sort((a, b) => CI_ORDER.indexOf(a.name) - CI_ORDER.indexOf(b.name));

	print(`holocron ci — ${input.scope === "all" ? "all CI checks" : "required checks"} (${ordered.length})`);
	if (fellBack) print("  (no required tasks in the manifest — running every CI task)");
	print("");

	const jobs: CiJobReport[] = [];
	for (const entry of ordered) {
		const context = WORKFLOW_CHECK_CONTEXTS[entry.name] ?? null;
		print(`▶ ${context ?? entry.name}`);

		// `local: null` tasks (codeql, deploy, audit's server/baseline jobs) have
		// no built-in runner — but `runTask` steps 1–2 still honour an explicit
		// turbo task / `package.json` script (holocron's `"audit": "knip"`), so
		// don't short-circuit here. `runTask` returns "skip" when nothing runs.
		const r = runTask({
			print: (line) => print(`  ${line}`),
			logger: input.logger,
			exec: input.exec,
			readFile: input.readFile,
			fileExists: input.fileExists,
			listDir: input.listDir,
			lookPath: input.lookPath,
			task: entry.name,
			cwd: input.cwd,
			dryRun: input.dryRun ?? false,
			required: entry.required === true,
			...(input.filter ? { filter: input.filter } : {}),
			...(entry.name === "lint" ? { linters: input.linters } : {}),
		});

		// `runTask` only returns "unknown" for an unrecognised task; every entry
		// here is a known `CI_ORDER` task, so its status is a CiJobReport status.
		const status = r.status as CiJobReport["status"];
		jobs.push({ task: entry.name, checkContext: context, status, command: r.command, message: r.message });
	}

	const failed = jobs.filter((j) => j.status === "fail").length;
	const passed = jobs.filter((j) => j.status === "ok" || j.status === "dry-run").length;
	const skipped = jobs.filter((j) => j.status === "skip").length;

	print("");
	if (ordered.length === 0) {
		print("holocron ci — nothing to run");
	} else if (failed > 0) {
		print(`✗ ${failed} failed, ${passed} passed${skipped ? `, ${skipped} skipped` : ""}`);
	} else {
		print(`✓ ${passed} passed${skipped ? `, ${skipped} skipped` : ""}${input.dryRun ? " (plan only)" : ""}`);
	}

	return { status: failed > 0 ? "fail" : "ok", jobs };
}

function taskName(item: string | TaskEntry): string {
	return typeof item === "string" ? item : item.name;
}
