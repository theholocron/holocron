export const isValid = (item: unknown): boolean =>
	item !== null &&
	item !== undefined &&
	(!(Array.isArray(item) && item.length === 0));
