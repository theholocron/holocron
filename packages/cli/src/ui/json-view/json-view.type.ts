/** A JSON-pointer-ish path: `""` is the root, children append `/<key>`. */
export type Path = string;

export interface Line {
	path: Path;
	text: string;
	/** Object/array with at least one child — the only lines that fold. */
	foldable: boolean;
	expanded: boolean;
	/** Number of leading indent levels, so the TTY layer can jump to a parent. */
	level: number;
}

export interface RenderOptions {
	/** Paths currently expanded. */
	expanded: ReadonlySet<Path>;
}

export type Container = Record<string, unknown> | unknown[];

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

export interface ViewState {
	cursor: number;
	top: number;
	expanded: Set<Path>;
}

export type Key = "up" | "down" | "left" | "right" | "expandAll" | "collapseAll" | "quit";
