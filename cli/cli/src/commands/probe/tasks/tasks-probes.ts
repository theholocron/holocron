import type { PluginProbes } from "../../../plugin/index.js";
import { findLeftovers } from "./find-leftovers.js";
import { legacyReplacements } from "./legacy-replacements.js";
import type { TasksIo } from "./tasks.type.js";

/** The group of probes that check the repo's task vocabulary. */
export const TASKS_PROVIDER = "tasks";

/**
 * `tasks names`: finds the hand-written places that still use an old task name from the flat-vocabulary map
 * (SPEC-0064, astromech's `LEGACY_NAMES`): a dotted one (`delivery.build`, `verification.unitTests`), a bare one used as a
 * task (`holocron run review`, a `review` script) or a `package.json` script with a reserved npm/pnpm name (`publish`).
 * It scans workflows, scripts, docs, `turbo.json`, `package.json`, the configs' `tasks:` and the hooks, and reports each
 * with file, line and the id to use instead. Each is a failure (exit code 1); `--warn` reports them as `info` rows
 * instead. A dotted name that is part of a workflow file name (`delivery.build.yml`) is skipped until the files are
 * renamed; `--files` lists those too. An intentional mention carries the `holocron-allow-old-name` marker on its line or the line above.
 * Files `sync` generates are left to `generated check`; specs, ADRs and the changelog name the old tasks on purpose.
 */
export function tasksProbes(io: TasksIo, names: Readonly<Record<string, string>> = legacyReplacements()): PluginProbes {
	return {
		names: {
			summary:
				"Report each use of an old task name in hand-written files; fails unless --warn; --files adds file names.",
			writes: false,
			async run(ctx) {
				const status = ctx.args?.includes("--warn") ? "info" : "fail";
				ctx.say({ status: "heading", label: "Old task names" });
				const found = findLeftovers(io.files(), names, { files: ctx.args?.includes("--files") === true });
				for (const f of found) {
					ctx.say({ status, label: `${f.file}:${f.line}`, detail: `${f.old} -> ${f.replacement}` });
				}
				ctx.say({
					status: found.length === 0 ? "ok" : status,
					label: "old names",
					detail: `${found.length} use(s) of ${Object.keys(names).length} old name(s)`,
				});
			},
		},
	};
}
