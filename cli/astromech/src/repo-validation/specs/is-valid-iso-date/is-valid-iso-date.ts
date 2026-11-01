/** Whether `value` is a `YYYY-MM-DD` date that exists as far as `Date.parse` can tell. */
export function isValidIsoDate(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
