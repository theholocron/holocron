/** A spinner for one step at a time, which the step can print through without breaking it. */
export interface Progress {
	/**
	 * Run `fn` under a spinner named `label`. The spinner is cleared, not kept, so the step's own result line stands alone.
	 * `fn` is given `update(text)`, which changes the spinner's text while it runs, such as a counter; it does nothing
	 * when no spinner is drawn, and a `fn` that ignores it is unaffected.
	 */
	run<T>(label: string, fn: (update: (text: string) => void) => Promise<T>): Promise<T>;
	/** Print a line without breaking the spinner: it is cleared, the line printed, and the spinner drawn again. */
	print(line: string): void;
}

/**
 * Hooks something into a running step, such as a retry notice. It is given the step's label and a way to change the
 * spinner's text, and returns the function that unhooks it, called when the step ends.
 */
export type ProgressListener = (label: string, setText: (text: string) => void) => () => void;
