import type { BoardItemInput, BoardStatusCategory, StatusCategory } from "../../../plugin/index.js";
import type { BoardPlacement, PlaceOnBoardInput } from "./place-on-board.type.js";

/** The board category an issue's own status category stands for; `other` has none, so only a named status carries. */
const BOARD_CATEGORY: Record<StatusCategory, BoardStatusCategory | undefined> = {
	open: "planned",
	"in-progress": "active",
	"in-review": "active",
	done: "done",
	other: undefined,
};

/**
 * Puts migrated issues on a board of the target: finds the open board by name or makes it from the template, then adds
 * each issue with the status and priority of its record. Nothing is written on a dry run, which only says whether the
 * board exists. A second run adds nothing twice and sets no value the item already has (`Projects.addItems`).
 */
export async function placeOnBoard(input: PlaceOnBoardInput): Promise<BoardPlacement> {
	const { projects, owner, name, template } = input;
	let board = await projects.find(owner, name);
	const created = !board;
	if (input.dryRun) return { board, created, items: [] };
	board ??= await projects.create(owner, name, template);

	const byKey = new Map(input.records.map((r) => [r.key, r]));
	const placed = input.results.flatMap((result) => {
		if (!result.key) return [];
		const record = byKey.get(result.source);
		const category = record ? BOARD_CATEGORY[record.statusCategory] : undefined;
		const item: BoardItemInput = {
			key: result.key,
			...(record?.status ? { status: record.status } : {}),
			...(category ? { category } : {}),
			...(record?.priority ? { priority: record.priority } : {}),
		};
		return [{ source: result.source, item }];
	});
	const added = await projects.addItems(
		owner,
		board,
		placed.map((p) => p.item),
		template
	);
	return {
		board,
		created,
		items: placed.map((p, i) => ({
			source: p.source,
			key: p.item.key,
			added: added[i]!.added,
			dropped: added[i]!.dropped,
		})),
	};
}
