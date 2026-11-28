/** Options of `settleAlphaPins`. */
export interface SettleAlphaPinsOptions {
	/** Waits (milliseconds) before each look-up after the first; the number of tries is one more than its length. */
	waits?: readonly number[];
	/** Blocks for this long. Injectable for testing; the default waits on the thread. */
	sleep?: (milliseconds: number) => void;
	print?: (line: string) => void;
}
