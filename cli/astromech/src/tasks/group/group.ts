/**
 * `holocron run <namespace>` — run every configured task under one
 * namespace prefix (`sourceQuality.*`, `verification.*`, …) in sequence.
 * `Astromech.run()` falls back here whenever the given name isn't an exact
 * `TASKS` entry but matches the prefix of one or more configured tasks —
 * same "aggregate several real tasks into one report" shape `runCi` already
 * established, scoped to one namespace instead of the merge-gating set.
 *
 * Every task in the namespace always runs — one task's failure never skips
 * the rest, same as `runCi`'s own loop — so a single invocation surfaces
 * every problem in the namespace at once instead of stopping at the first.
 */

import { normalizeTaskEntry, type TasksConfig } from "../../config/schema/index.js";
import { matchNamespace } from "../match-namespace/index.js";
import { runTask } from "../run/index.js";
import type { GroupInput, GroupJobReport, GroupReport } from "./group.type.js";

/** The `jobs` switches of a task's entry, as a `runTask` input; nothing when it has none. */
function jobSwitches(config: TasksConfig, name: string): { jobSwitches?: Record<string, boolean> } {
	// only called for a name `matchNamespace` found in `config.tasks`, so the list exists
	const tasks = config.tasks as NonNullable<TasksConfig["tasks"]>;
	const jobs = tasks.map(normalizeTaskEntry).find((e) => e.name === name)?.jobs;
	return jobs ? { jobSwitches: jobs } : {};
}

export function runGroup(input: GroupInput): GroupReport {
	const { print, namespace } = input;
	const names = matchNamespace(input.config, namespace);
	if (names.length === 0) return { status: "unknown", jobs: [] };

	print(`holocron run ${namespace} — ${names.length} task(s)`);
	print("");

	const jobs: GroupJobReport[] = [];
	for (const name of names) {
		print(`▶ ${name}`);
		const r = runTask({
			print: (line) => print(`  ${line}`),
			logger: input.logger,
			exec: input.exec,
			readFile: input.readFile,
			fileExists: input.fileExists,
			listDir: input.listDir,
			lookPath: input.lookPath,
			task: name,
			...jobSwitches(input.config, name),
			cwd: input.cwd,
			dryRun: input.dryRun ?? false,
			...(input.filter ? { filter: input.filter } : {}),
		});
		// `runTask` only returns "unknown" for an unrecognised task name; every
		// name here came from the repo's own config, so its status is a
		// GroupJobReport status.
		jobs.push({
			task: name,
			status: r.status as GroupJobReport["status"],
			command: r.command,
			message: r.message,
		});
	}

	const status = jobs.some((j) => j.status === "fail")
		? "fail"
		: jobs.every((j) => j.status === "dry-run")
			? "dry-run"
			: "ok";
	return { status, jobs };
}
