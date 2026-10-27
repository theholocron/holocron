/** Whether two templates are the same message, whatever the whitespace between the lines. */
export const sameTemplate = (a: string | undefined, b: string): boolean =>
	(a ?? "").replace(/\s+/g, "") === b.replace(/\s+/g, "");
