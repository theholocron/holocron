/** One run of lines that differ between two texts, as `[from, to)` ranges of their line arrays (0-indexed). */
export interface LineHunk {
	/** First differing line of the original. */
	from: number;
	/** One past the last differing line of the original; equal to `from` for a pure insertion. */
	to: number;
	/** First line of the replacement in the fixed text. */
	fixedFrom: number;
	/** One past the last line of the replacement; equal to `fixedFrom` for a pure deletion. */
	fixedTo: number;
}
