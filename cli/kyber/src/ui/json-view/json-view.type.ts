/** A JSON-pointer-ish path: `""` is the root, children append `/<key>`. */
export type Path = string;

/** One rendered line of the viewer. */
export interface Line {
	/** Where this line's value sits in the document. */
	path: Path;
	/** The line as drawn, indent included. */
	text: string;
	/** Object/array with at least one child — the only lines that fold. */
	foldable: boolean;
	/** Whether this line's children are shown. */
	expanded: boolean;
	/** Number of leading indent levels, so the TTY layer can jump to a parent. */
	level: number;
}

/** What {@link renderTree} needs to draw the document. */
export interface RenderOptions {
	/** Paths currently expanded. */
	expanded: ReadonlySet<Path>;
}

/** A value that can have children: an object or an array. */
export type Container = Record<string, unknown> | unknown[];

/** How {@link viewJson} shows a document. */
export interface ViewJsonOptions {
	/** Collapse containers deeper than this many levels (static mode and the interactive start state). */
	depth?: number;
	/**
	 * `true` forces the folding viewer (throws without a TTY), `false` forces
	 * static output. Left unset it auto-enables when stdin and stdout are both
	 * TTYs and no `depth` was asked for (an explicit depth means static output).
	 */
	interactive?: boolean;
}

/** Where the interactive viewer is: the selected line, the first visible line and the open containers. */
export interface ViewState {
	/** The index of the selected line. */
	cursor: number;
	/** The index of the first line on screen. */
	top: number;
	/** The paths currently open. */
	expanded: Set<Path>;
}

/** A key the interactive viewer reacts to, already mapped from the terminal's escape sequences. */
export type Key = "up" | "down" | "left" | "right" | "expandAll" | "collapseAll" | "quit";
