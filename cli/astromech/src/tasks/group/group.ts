/**
 * `holocron run <suite>` — run a list of tasks in sequence and report each: the configured leaves of a suite
 * (`holocron run test`) or, for an old intent-group name, the tasks that group held (`holocron run sourceQuality`).
 * `Astromech.run()` builds the list; this runs it.
 *
 * Every task always runs — one task's failure never skips the rest, same as `runCi`'s own loop — so a single
 * invocation surfaces every problem in the suite at once instead of stopping at the first.
 */

import { TASKS } from "../../registry/index.js";
import { runTask } from "../run/index.js";
import type { GroupInput, GroupJobReport, GroupReport } from "./group.type.js";

/** Runs every task of a group in sequence and reports each. */
export function runGroup(input: GroupInput): GroupReport {
	const { print, label, members, skipped = [] } = input;
	if (members.length === 0 && skipped.length === 0) return { status: "unknown", jobs: [] };

	print(`holocron run ${label} — ${members.length + skipped.length} task(s)`);
	print("");

	const jobs: GroupJobReport[] = [];
	for (const { task, message } of skipped) {
		print(`▶ ${task}`);
		print(`  · ${message}`);
		jobs.push({ task, status: "skip", message });
	}
	for (const member of members) {
		const { task } = member;
		print(`▶ ${task}`);
		const r = runTask({
			print: (line) => print(`  ${line}`),
			logger: input.logger,
			exec: input.exec,
			readFile: input.readFile,
			fileExists: input.fileExists,
			listDir: input.listDir,
			lookPath: input.lookPath,
			task,
			...(member.jobSwitches ? { jobSwitches: member.jobSwitches } : {}),
			...(member.passthrough ? { passthrough: member.passthrough } : {}),
			cwd: input.cwd,
			dryRun: input.dryRun ?? false,
			...(input.filter ? { filter: input.filter } : {}),
			...(input.affected ? { affected: true } : {}),
			...(input.base ? { base: input.base } : {}),
			...(input.env ? { env: input.env } : {}),
		});
		// `runTask` only returns "unknown" for an unrecognised task name; every
		// task here came from the registry, so its status is a GroupJobReport status.
		const ciOnly =
			r.status === "skip" && TASKS[task]?.local === null && !TASKS[task]?.linterGroup && !TASKS[task]?.jobs;
		jobs.push({
			task,
			status: r.status as GroupJobReport["status"],
			command: r.command,
			message: ciOnly ? "skipped (CI only)" : r.message,
		});
	}

	const status = jobs.some((j) => j.status === "fail")
		? "fail"
		: jobs.every((j) => j.status === "dry-run" || j.status === "skip") && jobs.some((j) => j.status === "dry-run")
			? "dry-run"
			: "ok";
	return { status, jobs };
}
