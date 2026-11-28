/** The result of a Google call as a tuple of error, value and elapsed milliseconds: `[Error, null, ms]` on failure, `[null, T, ms]` on success. */
export type Return<T> = [Error, null, number] | [null, T, number];
