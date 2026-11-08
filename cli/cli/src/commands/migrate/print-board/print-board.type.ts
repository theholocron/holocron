import type { BoardPlacement } from "../place-on-board/index.js";

/** What {@link printBoard} needs. */
export interface PrintBoardInput {
	/** Where the line goes. */
	print: (line: string) => void;
	/** The board's name. */
	name: string;
	/** The name of the template a missing board is made from. */
	template: string;
	/** What {@link placeOnBoard} did. */
	placement: BoardPlacement;
	/** Whether nothing was written. */
	dryRun: boolean;
}
