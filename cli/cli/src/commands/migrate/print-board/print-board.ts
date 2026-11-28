import { statusRow } from "@theholocron/kyber/ui";

import type { PrintBoardInput } from "./print-board.type.js";

/** Says what became of the board a project migration put its issues on, in the rows the rest of `migrate` prints. */
export function printBoard(input: PrintBoardInput): void {
	const { print, name, template, placement, dryRun } = input;
	const { board, created, items } = placement;
	if (dryRun) {
		const state = created ? `would create from template ${template}` : "exists; would add the issues to it";
		print(statusRow("skip", ["migrate", `board "${name}": ${state}`]));
		return;
	}
	const added = items.filter((i) => i.added).length;
	print(
		statusRow("ok", [
			"migrate",
			`board "${name}": ${created ? "created" : "found"}, added ${added}, already there ${items.length - added} (${board?.url})`,
		])
	);
}
