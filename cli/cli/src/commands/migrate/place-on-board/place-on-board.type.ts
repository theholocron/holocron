import type { BoardSummary, BoardTemplate, ImportResult, IssueRecord, Projects } from "../../../plugin/index.js";

/** A `projects` provider that can put issues on a board. */
export type BoardWriter = Projects & { addItems: NonNullable<Projects["addItems"]> };

/** What {@link placeOnBoard} needs. */
export interface PlaceOnBoardInput {
	/** The target's `projects` provider, which has `addItems`. */
	projects: BoardWriter;
	/** Whoever owns the boards (a GitHub organization). */
	owner: string;
	/** The board's name; the source board's own name. */
	name: string;
	/** The template a board that has to be made is made from. */
	template: BoardTemplate;
	/** The records that were migrated, for the status and priority each carries. */
	records: readonly IssueRecord[];
	/** What the import did with them; an issue with a target key goes on the board. */
	results: readonly ImportResult[];
	/** Read the board, change nothing. */
	dryRun: boolean;
}

/** What happened to one migrated issue on the board. */
export interface PlacedItem {
	/** The key of the issue in the source tracker. */
	source: string;
	/** The key it has on the target. */
	key: string;
	/** Whether it was put on the board now; false when it was already there. */
	added: boolean;
	/** Values the board has no option for. */
	dropped: string[];
}

/** What {@link placeOnBoard} did. */
export interface BoardPlacement {
	/** The board, or undefined on a dry run where it does not exist yet. */
	board?: BoardSummary | undefined;
	/** Whether the board was made now (or, on a dry run, would be). */
	created: boolean;
	/** One entry per issue that has a key on the target; empty on a dry run. */
	items: PlacedItem[];
}
