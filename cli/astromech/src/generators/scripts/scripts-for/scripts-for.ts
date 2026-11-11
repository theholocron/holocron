import type { TasksConfig } from "../../../config/schema/index.js";
import type { TaskDef } from "../../../registry/index.js";
import { TASKS } from "../../../registry/index.js";
import { isLegacySpelling } from "../../../vocabulary/index.js";
import { planSuites } from "../plan-suites/index.js";
import { planTasks } from "../plan-tasks/index.js";
import type { RepoShape } from "./scripts-for.type.js";

/**
 * The `holocron run` words of an id: a suite member takes a second word (`test:unit` is `test unit`), anything else is
 * its own (`deploy-preview`).
 */
function runWords(id: string): string {
	return id.replace(":", " ");
}

/**
 * The `package.json` scripts a manifest asks for, by name: the one rule that `sync` writes, `probe generated
 * check` compares against, and the `turbo.json` generator agrees with (spec `ci-flat-task-vocabulary`, "Scripts").
 * `holocron` and `prepare` are not tasks and are added by the caller.
 *
 * A repo with a generated `turbo.json` ({@link RepoShape.monorepo}) gets root scripts that call turbo:
 * `turbo run <key>` for a package-scoped leaf and for each suite (an aggregator task), and, for a repo-scoped leaf with
 * a local tool, the tool's own command (`prettier --write .`), because `turbo run <id>` would call itself. A leaf with no
 * local command has no script. The key a leaf has in turbo follows the manifest entry's spelling.
 *
 * A single package gets `holocron run <words> --` for every task it can run locally; the trailing `--` is there because
 * pnpm appends arguments as typed, and `holocron run` would otherwise reject a flag meant for the tool. An entry written
 * with an old dotted name keeps its old script, named as the entry is, and no suite scripts, until the list is
 * rewritten with flat ids.
 */
export function scriptsFor(
	config: TasksConfig,
	registry: Record<string, TaskDef> = TASKS,
	repo: RepoShape = { monorepo: false }
): Record<string, string> {
	const planned = planTasks(config, registry);
	const out: Record<string, string> = {};

	if (repo.monorepo) {
		for (const task of planned) {
			if (task.kind === "turbo") out[task.script] = `turbo run ${task.key}`;
			else if (task.kind === "tool") out[task.script] = task.command!;
		}
		for (const suite of planSuites(planned, registry).keys()) out[suite] = `turbo run ${suite}`;
		return out;
	}

	for (const task of planned) {
		if (isLegacySpelling(task.entry)) out[task.entry] = `holocron run ${task.entry} --`;
		else out[task.script] = `holocron run ${runWords(task.id)} --`;
	}
	for (const task of planned) {
		const suite = registry[task.id]!.suite;
		if (suite !== undefined && !isLegacySpelling(task.entry)) out[suite] = `holocron run ${suite} --`;
	}
	return out;
}
