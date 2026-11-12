/**
 * `holocron reconcile project [board]` — set the status of board items where a rule says so (spec `command-project`,
 * "Keeping a board true"): an open item with an open blocker goes to the `blocked` status, an open blocked one with no
 * blocker returns to `planned`, a closed or merged one goes to `done`. Status only, never priority or any other field.
 *
 * The rules are `planReconcile()`, pure; this reads the items through the `projects` capability, applies each change
 * through `setStatus` and prints one line per item. A refusal is a reported failure and the run continues; the exit is
 * non-zero if any failed. Idempotent, and `--dry-run` prints the plan and calls no mutator. A provider that cannot list
 * items or set a status is skipped cleanly. An open item with no status is reported, not set: the doctor tells a person.
 */

import { join } from "node:path";

import { style } from "@theholocron/kyber/ui";
import { describeError, logReason } from "@theholocron/kyber/ui";

import { getLogger } from "../../../observability/logger/index.js";
import { assertPluginsResolvable, type BoardSummary, PluginLoader, type Projects } from "../../../plugin/index.js";
import { createFsTemplatesIo } from "../fs-templates-io/index.js";
import { loadTemplates } from "../load-templates/index.js";
import { planReconcile, type ReconcileChange } from "../plan-reconcile/index.js";
import { resolveProjectOptions } from "../project-options/index.js";
import type { BoardReconcileOutcome, ProjectReconcileReport, RunProjectReconcileInput } from "./reconcile.type.js";

/** The sentence after a change's arrow: why the rule applied. */
const WHY: Record<ReconcileChange["reason"], string> = {
	blocked: "has an open blocker",
	unblocked: "no open blocker left",
	closed: "closed",
};

const line = (c: ReconcileChange) => `${c.key} ${c.from ?? "no status"} → ${c.to} (${WHY[c.reason]})`;

export async function runProjectReconcile(input: RunProjectReconcileInput): Promise<ProjectReconcileReport> {
	const print = input.print ?? ((text: string) => console.log(text));
	const logger = input.logger ?? getLogger();
	/* v8 ignore next -- the real loader is only built outside tests, which always inject one */
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "reconcile project");

	const dryRun = input.context.dryRun ?? false;
	const report: ProjectReconcileReport = { status: "ok", boards: [], failures: [] };
	const refuse = (message: string, reason: string = message): ProjectReconcileReport => {
		print(`  ${style.fail(message)}`);
		print("");
		print(style.header("0 ok, 1 fail, 0 skipped"));
		logger.warn({ reason }, "reconcile project");
		return { ...report, status: "fail", message };
	};
	const failStep = (step: string, message: string) => {
		report.failures.push({ step, message });
		print(`  ${style.fail(`${step}: ${message}`)}`);
	};

	const entry = input.loaded.resolved.providers.projects;
	if (!entry || !loader.has("projects")) {
		return refuse(
			'no `projects` provider is configured — add `projects: ["github", { boards: [...] }]` to holocron.config.ts'
		);
	}
	const projects = loader.get("projects") as Projects;
	if (typeof projects.items !== "function" || typeof projects.setStatus !== "function") {
		print(
			`  ${style.skip(`the \`${projects.providerName}\` provider cannot list items or set a status: nothing to reconcile`)}`
		);
		return { ...report, message: "skipped" };
	}

	/* v8 ignore start -- `projects` has exactly one provider, so the tuple is always there with its options */
	const tuple = entry.cardinality === "single" ? entry.tuple : entry.tuples[0];
	const options = (tuple?.options ?? {}) as Record<string, unknown>;
	/* v8 ignore stop */
	const resolved = resolveProjectOptions(options, input.context.org ?? input.loaded.resolved.org ?? "");
	if (!resolved.ok) return refuse(`providers.projects: ${resolved.problems.join("; ")}`);
	const { owner, boards, templatesDir } = resolved.options;
	if (boards.length === 0)
		return refuse("`providers.projects` declares no boards — add `boards: [{ template, name }]`");
	const wanted = input.board === undefined ? boards : boards.filter((b) => b.name === input.board);
	if (wanted.length === 0) {
		return refuse(
			`no declared board is named "${input.board}" (declared: ${boards.map((b) => b.name).join(", ")})`
		);
	}

	const loadedTemplates = await loadTemplates(
		join(input.context.repoRoot, templatesDir),
		input.templatesIo ?? createFsTemplatesIo(input.context.repoRoot)
	);
	for (const problem of loadedTemplates.problems) print(`  ${style.warn(problem)}`);

	let ok = 0;
	let skipped = 0;
	for (const declared of wanted) {
		print(style.header(`${declared.name} (${declared.template})`));
		const template = loadedTemplates.templates[declared.template];
		if (!template) {
			failStep(declared.name, `there is no template named "${declared.template}"`);
			continue;
		}

		let board: BoardSummary | undefined;
		let plan: ReturnType<typeof planReconcile>;
		try {
			board = await projects.find(owner, declared.name);
			if (!board) {
				failStep(declared.name, "the board does not exist or is closed; run `holocron setup project`");
				continue;
			}
			plan = planReconcile(await projects.items(owner, board, template), template);
		} catch (err) {
			failStep(declared.name, describeError(err));
			logger.warn({ board: declared.name, reason: logReason(err) }, "reconcile project");
			continue;
		}

		const outcome: BoardReconcileOutcome = {
			name: declared.name,
			changes: plan.changes,
			applied: [],
			unset: plan.unset.map((i) => i.key),
			unresolved: plan.unresolved,
		};
		report.boards.push(outcome);

		for (const change of plan.changes) {
			if (dryRun) {
				print(`  ${style.skip(`would set ${line(change)}`)}`);
				skipped++;
				continue;
			}
			try {
				const result = await projects.setStatus(owner, board, change.key, change.to);
				if (result.status !== change.to) {
					failStep(change.key, `refused: still ${result.status}${result.via ? ` (${result.via})` : ""}`);
					continue;
				}
				outcome.applied.push(change.key);
				ok++;
				print(`  ${style.success(`${result.transitioned ? "set" : "already"} ${line(change)}`)}`);
			} catch (err) {
				failStep(change.key, describeError(err));
				logger.warn({ board: declared.name, key: change.key, reason: logReason(err) }, "reconcile project");
			}
		}
		for (const item of plan.unset) {
			print(`  ${style.warn(`${item.key} has no status: needs a decision, left as it is`)}`);
			skipped++;
		}
		for (const u of plan.unresolved) {
			print(
				`  ${style.warn(`${u.key} ${WHY[u.reason]} but the template has no ${u.category} status: left as it is`)}`
			);
			skipped++;
		}
		if (plan.changes.length === 0 && plan.unset.length === 0 && plan.unresolved.length === 0) {
			print(`  ${style.skip("already true")}`);
			skipped++;
		}
	}

	if (report.failures.length > 0) report.status = "fail";
	else if (dryRun) report.status = "dry-run";
	print("");
	print(style.header(`${ok} ok, ${report.failures.length} fail, ${skipped} skipped`));
	logger.info(
		{
			boards: report.boards.length,
			changes: report.boards.reduce((n, b) => n + b.changes.length, 0),
			failures: report.failures.length,
			status: report.status,
		},
		"reconcile project"
	);
	return report;
}
