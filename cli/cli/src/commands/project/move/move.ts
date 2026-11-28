/**
 * `holocron move issues <from> <to>` — carry the open items of one board to another by rule.
 *
 * Every open item goes with its status and priority; a closed or merged one stays behind, and the provider sets it to
 * a done status on the old board when it shows another. An item already on the target keeps its target values. It
 * writes, so it asks first (`--yes` skips the question; without a terminal it refuses instead of hanging) and `--dry-run`
 * only reads both boards' items and prints what would happen. A provider without the optional `move` is skipped with a
 * message.
 */

import { confirm } from "@inquirer/prompts";
import { NonInteractiveError, statusRow } from "@theholocron/kyber/ui";
import { describeError } from "@theholocron/kyber/ui";

import {
	assertPluginsResolvable,
	type BoardItem,
	type BoardSummary,
	type MoveReport,
	PluginLoader,
} from "../../../plugin/index.js";
import { openBoardContext } from "../board-context/index.js";
import type { ProjectMoveReport, RunProjectMoveInput } from "./move.type.js";

export async function runProjectMove(input: RunProjectMoveInput): Promise<ProjectMoveReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const stop = (status: "fail" | "skip", reason: string): ProjectMoveReport => {
		print(statusRow(status, ["move issues", reason]));
		return { status, reason };
	};

	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "move issues");
	const opened = await openBoardContext({
		loaded: input.loaded,
		context: input.context,
		loader,
		...(input.io ? { io: input.io } : {}),
	});
	if (!opened.ok) return stop(opened.kind, [opened.reason, ...opened.problems].join("; "));
	const { projects, owner, boards, templates } = opened.context;

	if (!projects.move) {
		return stop("skip", `the \`${projects.providerName}\` provider cannot move items between boards`);
	}

	const templateName =
		input.template ??
		boards.find((b) => b.name === input.to)?.template ??
		boards.find((b) => b.name === input.from)?.template ??
		"roadmap";
	const template = templates[templateName];
	if (!template) return stop("fail", `no template named "${templateName}"`);

	let from: BoardSummary | undefined;
	let to: BoardSummary | undefined;
	try {
		// The board being retired is often closed already, so it is found among all of them.
		from =
			(await projects.find(owner, input.from)) ?? (await projects.list(owner)).find((b) => b.name === input.from);
		to = await projects.find(owner, input.to);
	} catch (err) {
		return stop("fail", describeError(err));
	}
	if (!from) return stop("fail", `no board named "${input.from}"`);
	if (!to) return stop("fail", `no open board named "${input.to}"`);

	if (input.context.dryRun) {
		if (!projects.items)
			return stop("skip", `the \`${projects.providerName}\` provider cannot list items to preview`);
		try {
			const preview = previewMove(
				await projects.items(owner, from, template),
				await projects.items(owner, to, template)
			);
			print(statusRow("skip", ["move issues", "dry run: nothing was moved"]));
			printReport(preview, print, true);
			return { status: "ok", moved: preview };
		} catch (err) {
			return stop("fail", describeError(err));
		}
	}

	if (!input.yes) {
		const interactive = input.interactive ?? Boolean(process.stdin.isTTY);
		if (!interactive) {
			throw new NonInteractiveError(
				`\`move issues\` changes boards on ${projects.providerName}; pass --yes to run it without asking`
			);
		}
		const proceed = await (input.confirm ?? ((message) => confirm({ message, default: false })))(
			`Move the open items of "${from.name}" to "${to.name}"?`
		);
		if (!proceed) {
			print(statusRow("skip", ["move issues", "cancelled; nothing was changed"]));
			return { status: "cancelled" };
		}
	}

	try {
		const moved = await projects.move(owner, from, to, template);
		print(statusRow("ok", ["move issues", `"${from.name}" to "${to.name}"`]));
		printReport(moved, print, false);
		return { status: "ok", moved };
	} catch (err) {
		return stop("fail", describeError(err));
	}
}

/** What a move would do: the open items not yet on the target move, the ones already there are kept, closed ones stay. */
function previewMove(fromItems: readonly BoardItem[], toItems: readonly BoardItem[]): MoveReport {
	const onTarget = new Set(toItems.map((i) => i.key));
	return {
		moved: fromItems.filter((i) => i.open && !onTarget.has(i.key)).map((i) => i.key),
		kept: fromItems.filter((i) => i.open && onTarget.has(i.key)).map((i) => i.key),
		left: fromItems.filter((i) => !i.open).map((i) => i.key),
	};
}

function printReport(report: MoveReport, print: (line: string) => void, dry: boolean): void {
	const line = (label: string, keys: string[]): void => {
		print(`      ${label}: ${keys.length}${keys.length > 0 ? ` (${keys.join(", ")})` : ""}`);
	};
	line(dry ? "would move" : "moved", report.moved);
	line(dry ? "would keep (already on the target)" : "kept (already on the target)", report.kept);
	line("left (closed, stay on the old board)", report.left);
}
