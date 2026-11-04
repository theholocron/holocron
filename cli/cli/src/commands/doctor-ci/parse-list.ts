/** The strings of a JSON array, or an empty list when the text is not one. */
export function parseList(text: string): string[] {
	try {
		const value: unknown = JSON.parse(text);
		return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
	} catch {
		return [];
	}
}
