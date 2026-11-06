/**
 * `holocron doctor project` — does each board `providers.projects.boards` declares exist, and does it match its template?
 *
 * Read-only. Per declared board, found by name among the open boards: one row for the board, then the rows of
 * `boardRows()` (statuses in order, each field and its options, each view, each automation rule) and the four item rows of
 * `itemRows()`. What the board has beyond the template, and the items `project reconcile` would fix, are `info` rows: they
 * never fail the run. A template file that does not read is a failure naming the file. `--post [channel]` shares the
 * failing rows through the `notifications` provider's bot, like `doctor notifications --post`.
 */

import { style } from "@theholocron/kyber/ui";
import { describeError } from "@theholocron/kyber/ui";
import { type CheckRow, printCheckRows, printCheckSummary, summariseChecks } from "@theholocron/kyber/ui";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, type Notifications, PluginLoader } from "../../plugin/index.js";
import { postDoctorReport } from "../post-doctor-report/index.js";
import { openBoardContext } from "../project/board-context/index.js";
import { boardRows } from "./board-rows.js";
import type { DoctorProjectReport, RunDoctorProjectInput } from "./doctor-project.type.js";
import { itemRows } from "./item-rows.js";

const row = (
	id: string,
	title: string,
	status: CheckRow["status"],
	detail: string,
	problems: string[] = []
): CheckRow => ({
	id,
	title,
	status,
	detail,
	problems,
});

export async function runDoctorProject(input: RunDoctorProjectInput): Promise<DoctorProjectReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "doctor project");

	const rows = await checkBoards(input, loader);

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	if (input.post !== undefined) print(`  ${style.skip(await post(loader, input.post, rows, summary))}`);
	logger.info({ ...summary, status }, "doctor project");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: [...new Set(rows.map((r) => r.detail))].join("; ") } : {}),
	};
}

/** Shares the result as the first `notifications` provider that can post, or says why it could not. */
async function post(
	loader: PluginLoader,
	channel: string,
	rows: CheckRow[],
	summary: { ok: number; fail: number; skip: number }
): Promise<string> {
	const providers = loader.has("notifications") ? (loader.get("notifications") as Notifications[]) : [];
	const provider = providers.find((p) => p.postMessage) ?? providers[0];
	if (!provider) return "not posted: no `notifications` provider is configured";
	return postDoctorReport(
		provider,
		channel,
		{
			checks: rows.map((r) => ({ ...r, status: r.status === "ok" ? "pass" : r.status })),
			summary: { pass: summary.ok, fail: summary.fail, skip: summary.skip },
		},
		"project"
	);
}

async function checkBoards(input: RunDoctorProjectInput, loader: PluginLoader): Promise<CheckRow[]> {
	const opened = await openBoardContext({
		loaded: input.loaded,
		context: input.context,
		loader,
		...(input.io ? { io: input.io } : {}),
	});
	if (!opened.ok) return [row("project", "project", opened.kind, opened.reason, opened.problems)];
	const { projects, owner, boards, templates, templateProblems } = opened.context;

	// A template file that does not read names its file; the boards that do not use it are still checked.
	const rows: CheckRow[] = templateProblems.map((problem) => {
		/* v8 ignore next -- split always returns at least one element; the fallback only satisfies noUncheckedIndexedAccess */
		const file = problem.split(": ")[0] ?? problem;
		return row(`project:template:${file}`, `template file ${file}`, "fail", problem);
	});
	if (boards.length === 0) {
		return [...rows, row("project", "project", "skip", "no boards are declared in `providers.projects.boards`")];
	}

	for (const declared of boards) {
		const template = templates[declared.template];
		const title = `${declared.name}: board exists and is open`;
		try {
			const board = await projects.find(owner, declared.name);
			if (!board) {
				const closed = (await projects.list(owner)).some((b) => b.name === declared.name && b.closed);
				rows.push(
					row(
						`project:${declared.name}`,
						title,
						"fail",
						closed ? "the board is closed" : "no open board has this name",
						[
							closed
								? "reopen it, or run `holocron project setup` to make a new one"
								: "run `holocron project setup`",
						]
					)
				);
				continue;
			}
			rows.push(row(`project:${declared.name}`, title, "ok", board.url));
			if (!template) {
				rows.push(
					row(
						`project:${declared.name}:template`,
						`${declared.name}: template ${declared.template}`,
						"fail",
						"no built-in or file template has this name"
					)
				);
				continue;
			}
			rows.push(...boardRows(declared.name, template, await projects.read(owner, board)));
			rows.push(
				...(projects.items
					? itemRows(declared.name, await projects.items(owner, board, template))
					: [
							row(
								`project:${declared.name}:items`,
								`${declared.name}: items`,
								"skip",
								"the provider cannot list a board's items"
							),
						])
			);
		} catch (err) {
			rows.push(row(`project:${declared.name}`, title, "fail", describeError(err)));
		}
	}
	return rows;
}
