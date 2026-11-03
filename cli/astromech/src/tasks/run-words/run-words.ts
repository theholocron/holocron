/**
 * `holocron run <words…>` — turns the words of the command line into a task, a suite or an old name and runs it.
 *
 * The words are joined with `:` and the longest match against the registry wins (`test unit` is `test:unit`), and what
 * is left is forwarded to the task. A suite (`test`) runs the leaves the repo lists, in registry order. An old
 * dotted name still works and says so on stderr; so does an old intent-group name (`sourceQuality`). Spec
 * `ci-flat-task-vocabulary`, "Suite behavior in the runner".
 */

import { normalizeTaskEntry } from "../../config/schema/index.js";
import { TASKS } from "../../registry/index.js";
import { resolveTaskName, resolveWords, suiteMembers } from "../../vocabulary/index.js";
import type { GroupMember, GroupReport } from "../group/index.js";
import { runGroup } from "../group/index.js";
import { matchNamespace } from "../match-namespace/index.js";
import { insidePackage } from "../package-dir/index.js";
import type { RunTaskReport } from "../run/index.js";
import { runTask } from "../run/index.js";
import type { RunWordsInput } from "./run-words.type.js";

/** Runs what the words name and reports it: one task's report, or a group report for a suite or an old name that stood for several tasks. */
export function runWords(input: RunWordsInput): RunTaskReport | GroupReport {
	const { words, cwd, config, warn, print } = input;
	const entries = (config?.tasks ?? []).map(normalizeTaskEntry);
	const passthrough = input.passthrough ?? [];
	const dryRun = input.dryRun ?? false;
	const required = input.required ?? false;
	const deps = {
		print,
		logger: input.logger,
		exec: input.exec,
		readFile: input.readFile,
		fileExists: input.fileExists,
		listDir: input.listDir,
		lookPath: input.lookPath,
	};
	const scope = {
		...(input.filter ? { filter: input.filter } : {}),
		...(input.affected ? { affected: true } : {}),
		...(input.base ? { base: input.base } : {}),
		...(input.env ? { env: input.env } : {}),
	};
	const resolved = resolveWords(words);

	if (resolved.kind === "unknown") {
		const [first = "", ...more] = words;
		// An old intent-group name (`sourceQuality`) runs the configured tasks that were under it.
		const namespace = config ? matchNamespace(config, first) : [];
		if (namespace.length > 0) {
			warn(`"${first}" is a deprecated group name: use a suite (test, lint, scan) or the task ids it held`);
			const members = namespace.map((t) => ({
				task: t.id,
				...(t.passthrough ? { passthrough: t.passthrough } : {}),
			}));
			return runGroup({ ...deps, cwd, label: first, members, dryRun, ...scope });
		}
		// Not in the registry: still honours a turbo task or package script of that name, or reports it unknown.
		return runTask({
			...deps,
			task: first,
			cwd,
			passthrough: [...more, ...passthrough],
			dryRun,
			required,
			...scope,
		});
	}

	if (resolved.kind === "task") {
		const { targets, rest, legacy } = resolved;
		if (legacy) {
			warn(`"${legacy}" is a deprecated task name: use ${targets.map((t) => t.id).join(", ")}`);
		}
		if (targets.length > 1) {
			const members = targets.map((t) => ({
				task: t.id,
				...(t.passthrough ? { passthrough: t.passthrough } : {}),
			}));
			return runGroup({ ...deps, cwd, label: words.join(" "), members, dryRun, ...scope });
		}
		const { id, passthrough: implied = [] } = targets[0]!;
		return runTask({
			...deps,
			task: id,
			cwd,
			passthrough: [...rest, ...passthrough, ...implied, ...(input.check ? ["--check"] : [])],
			dryRun,
			required,
			...scope,
		});
	}

	const { suite, rest } = resolved;
	const all = suiteMembers(suite);
	const fromPackage = insidePackage(cwd, input.fileExists);
	// From a package directory a suite runs the package-scoped leaves for that package alone (the turbo workspace is
	// not in this directory, so each leaf runs its own tool or script here); the repo-wide ones need the root.
	const configured = new Set(entries.flatMap((e) => resolveTaskName(e.name).map((t) => t.id)));
	const chosen = fromPackage
		? all.filter((id) => TASKS[id]!.scope === "package")
		: all.filter((id) => configured.has(id));
	const skipped = fromPackage
		? all
				.filter((id) => TASKS[id]!.scope === "repo")
				.map((task) => ({ task, message: "skipped (repo-wide, run from the root)" }))
		: [];
	if (chosen.length === 0) {
		print(`✗ no ${suite} tasks in this repo's config (the leaves are ${all.join(", ")})`);
		return { status: "unknown", jobs: [] };
	}

	// pnpm appends extra arguments to a script as typed, so they belong to a leaf: more than one leaf has no one tool to give them to.
	const extra = [...rest, ...passthrough, ...(input.check ? ["--check"] : [])];
	if (extra.length > 0 && chosen.length > 1) {
		print(
			`✗ holocron run ${suite}: "${extra.join(" ")}" applies to one leaf, not to the ${chosen.length} leaves of the suite — name one (${chosen.join(", ")})`
		);
		return { status: "fail", jobs: [] };
	}
	const members: GroupMember[] = chosen.map((task) => ({
		task,
		...(extra.length > 0 ? { passthrough: extra } : {}),
	}));
	return runGroup({ ...deps, cwd, label: suite, members, skipped, dryRun, ...scope });
}
