import type { PluginProbes } from "../../../plugin/index.js";
import { findLeftovers } from "./find-leftovers.js";
import { LEGACY_TASK_NAMES } from "./legacy-task-names.js";
import type { TasksIo } from "./tasks.type.js";

/** The group of probes that check the repo's task vocabulary. */
export const TASKS_PROVIDER = "tasks";

/**
 * `tasks names`: finds the hand-written places that still use an old dotted task name (`delivery.build`,
 * `verification.unitTests`, ...) from the flat-vocabulary map (SPEC-0064): workflows, scripts, docs, `turbo.json`,
 * `package.json`, the configs' `tasks:` and the hooks. Each is reported with file, line and the id to use instead. It
 * is a warning (an `info` row) while the rename is under way and fails the run with `--fail`, for after the window.
 * Files `repo sync` generates are left to `generated check`; specs, ADRs and the changelog name the old tasks on purpose.
 */
export function tasksProbes(io: TasksIo, names: Readonly<Record<string, string>> = LEGACY_TASK_NAMES): PluginProbes {
	return {
		names: {
			summary: "Report each use of an old dotted task name in hand-written files; --fail makes it an error.",
			writes: false,
			async run(ctx) {
				const status = ctx.args?.includes("--fail") ? "fail" : "info";
				ctx.say({ status: "heading", label: "Old task names" });
				const found = findLeftovers(io.files(), names);
				for (const f of found) {
					ctx.say({ status, label: `${f.file}:${f.line}`, detail: `${f.old} -> ${f.replacement}` });
				}
				ctx.say({
					status: found.length === 0 ? "ok" : "info",
					label: "old names",
					detail: `${found.length} use(s) of ${Object.keys(names).length} old name(s)`,
				});
			},
		},
	};
}
