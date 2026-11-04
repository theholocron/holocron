/**
 * `holocron doctor ci` — has this repository moved to the flat task vocabulary (spec `ci-flat-task-vocabulary`)?
 *
 * Read-only, and it needs no provider: it reads the config and `.github/workflows`. One row each for the tasks (any
 * deprecated alias, with the id that replaces it), the generated callers (file, workflow and job names equal the task
 * id), the `ci` aggregate (its `expected` list is the configured tasks') and the callers' home (the frozen
 * `theholocron/.github` or holocron at `ci-v1`). The ruleset's required checks are `doctor repo`'s to compare, not this
 * check's.
 */

import { aggregateChecks, legacyGate } from "@theholocron/astromech";
import type { TasksConfig } from "@theholocron/astromech/config";

import { getLogger } from "../../observability/logger/index.js";
import { printCheckRows, printCheckSummary, summariseChecks } from "../doctor-checks/index.js";
import { aggregateRow } from "./aggregate-row.js";
import { callersRow } from "./callers-row.js";
import type { DoctorCiReport, RunDoctorCiInput } from "./doctor-ci.type.js";
import { homeRow } from "./home-row.js";
import { parseCaller } from "./parse-caller.js";
import { realCiIo } from "./real-ci-io.js";
import { tasksRow } from "./tasks-row.js";

export async function runDoctorCi(input: RunDoctorCiInput): Promise<DoctorCiReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const io = input.io ?? realCiIo(input.context.repoRoot);
	const config = input.loaded.resolved;
	const tasks = config.tasks ?? [];

	const callers = io.workflows().flatMap(({ file, text }) => parseCaller(file, text) ?? []);
	const tasksConfig: TasksConfig = { tasks: tasks as TasksConfig["tasks"] };
	if (config.extraRequiredChecks) tasksConfig.extraRequiredChecks = config.extraRequiredChecks;
	const names = tasks.map((entry) => (typeof entry === "string" ? entry : entry.name));

	const rows = [
		tasksRow(names),
		callersRow(callers),
		aggregateRow(callers, aggregateChecks(tasksConfig).expected),
		homeRow(callers, input.legacyGate ?? legacyGate()),
	];

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	// The tasks row always runs, so there is always something to pass: a repo with no callers is not a skip overall.
	const status = summary.fail > 0 ? "fail" : "ok";
	logger.info({ ...summary, status }, "doctor ci");
	return { status, rows, summary };
}
