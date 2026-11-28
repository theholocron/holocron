/** How `declaredVsActual` compares and words its problem lines. */
export interface DeclaredVsActualOptions<T> {
	/** What the things compared are called in the problem lines: `variable`, `secret`, `check`. */
	noun: string;
	/** Whether two values for the same key agree. Defaults to `===`. */
	equal?: (declared: T, actual: T) => boolean;
	/** How a value reads in a problem line. Defaults to `String`. */
	show?: (value: T) => string;
	/** Whether a key found but not declared is a problem. Defaults to `true`. */
	flagExtra?: boolean;
}
