/** Wraps a string in an array; an array is returned as it is. */
export const toArray = (str: string | string[]): string[] => (Array.isArray(str) ? str : [str]);
/** Whether the value is exactly the string `"true"`. */
export const toBoolean = (val: string | undefined) => val === "true";
