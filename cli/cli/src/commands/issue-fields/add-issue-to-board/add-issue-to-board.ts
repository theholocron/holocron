import { type CheckRow, describeError } from "@theholocron/kyber/ui";

import { openBoardContext } from "../../project/board-context/index.js";
import type { AddIssueToBoardInput } from "./add-issue-to-board.type.js";

const row = (board: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id: `board ${board}`,
	title: `board ${board}`,
	status,
	detail,
	problems: [],
});

/**
 * Puts an issue on one of the boards the repo declares (`providers.projects.boards`), through the `projects` provider's
 * `addItems`. It finds the board by name among the open boards and never makes one (`setup project` does), and an
 * issue already on it keeps its place and its values. A provider with no `addItems` is a skipped row; everything else
 * that goes wrong is a failing row, never a throw, so the issue that was just filed is not lost behind it.
 */
export async function addIssueToBoard(input: AddIssueToBoardInput): Promise<CheckRow> {
	const { board, key } = input;
	try {
		const opened = await openBoardContext({
			loaded: input.loaded,
			context: input.context,
			loader: input.loader,
			...(input.io ? { io: input.io } : {}),
		});
		if (!opened.ok) {
			return row(board, opened.kind === "skip" ? "skip" : "fail", [opened.reason, ...opened.problems].join("; "));
		}
		const { projects, owner, boards, templates } = opened.context;
		if (!projects.addItems)
			return row(board, "skip", `the \`${projects.providerName}\` provider cannot add items to a board`);
		const declared = boards.find((b) => b.name.toLowerCase() === board.toLowerCase());
		if (!declared) {
			const names = boards.map((b) => b.name).join(", ");
			return row(
				board,
				"fail",
				`no board named "${board}" is declared in providers.projects${names ? ` (declared: ${names})` : ""}`
			);
		}
		const template = templates[declared.template];
		if (!template)
			return row(board, "fail", `the template "${declared.template}" of "${declared.name}" is not available`);
		const found = await projects.find(owner, declared.name);
		if (!found)
			return row(
				board,
				"fail",
				`the board "${declared.name}" does not exist yet; \`holocron setup project\` makes it`
			);
		if (input.dryRun) return row(board, "skip", `would add ${key} to "${declared.name}"`);
		const [added] = await projects.addItems(
			owner,
			found,
			[{ key, ...(input.priority ? { priority: input.priority } : {}) }],
			template
		);
		const dropped = added?.dropped ?? [];
		return row(
			board,
			dropped.length > 0 ? "skip" : "ok",
			`${added?.added ? "added" : "already on"} "${declared.name}"${dropped.length > 0 ? `; not set: ${dropped.join(", ")}` : ""}`
		);
	} catch (err) {
		return row(board, "fail", `could not add ${key} to the board: ${describeError(err)}`);
	}
}
