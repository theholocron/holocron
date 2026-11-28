/** Names that differ only in case are one secret to GitHub, so the first spelling wins. */
export const uniqueNames = (names: string[]): string[] => {
	const seen = new Map<string, string>();
	for (const name of names) if (!seen.has(name.toUpperCase())) seen.set(name.toUpperCase(), name);
	return [...seen.values()];
};
